import Foundation

enum TransferActivityKind: Equatable {
    case preview
    case analysis
    case create
}

struct TransferActivity: Equatable {
    let kind: TransferActivityKind
    let eyebrow: String
    let title: String
    let detail: String
    let progress: Int
    let isEstimated: Bool

    var progressText: String {
        "\(progress)%"
    }
}

@MainActor
final class TransferViewModel: ObservableObject {
    enum Phase: Equatable {
        case idle
        case previewing
        case previewReady
        case analyzing
        case analysisReady
        case creating
        case created
        case failed(String)
    }

    @Published var playlistInput = ""
    @Published var destinationPlaylistName = ""
    @Published private(set) var phase: Phase = .idle
    @Published private(set) var preview: PlaylistPreviewResponse?
    @Published private(set) var analysis: TransferAnalysis?
    @Published private(set) var createdPlaylist: CreatedAppleMusicPlaylist?
    @Published private(set) var approvedItemIDs: Set<Int> = []
    @Published private(set) var skippedItemIDs: Set<Int> = []
    @Published private(set) var selectedCandidatesByItemID: [Int: AppleSongCandidate] = [:]
    @Published private(set) var transferredItemIDs: Set<Int> = []
    @Published private(set) var statusMessage = "Paste a public Spotify playlist or song link to begin."
    @Published private(set) var activity: TransferActivity?

    private let api: TransferAPIClient
    private let appleMusic: AppleMusicLibraryWriter
    private var progressPulseTask: Task<Void, Never>?

    init(
        api: TransferAPIClient = TransferAPIClient(),
        appleMusic: AppleMusicLibraryWriter = AppleMusicLibraryWriter()
    ) {
        self.api = api
        self.appleMusic = appleMusic

        #if DEBUG
        applyScreenshotScenarioFromLaunchArguments()
        #endif
    }

    var canPreview: Bool {
        !playlistInput.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !isBusy
    }

    var canAnalyze: Bool {
        preview != nil && !isBusy
    }

    var canCreate: Bool {
        analysis != nil && !readyItems.isEmpty && createdPlaylist == nil && !isBusy
    }

    var pendingSyncItems: [TransferItem] {
        readyItems.filter { !transferredItemIDs.contains($0.id) }
    }

    var canUpdateCreatedPlaylist: Bool {
        analysis != nil && createdPlaylist != nil && !pendingSyncItems.isEmpty && !isBusy
    }

    var isSingleTrackImport: Bool {
        analysis?.playlist.kind == "track" || preview?.playlist.kind == "track"
    }

    var isBusy: Bool {
        phase == .previewing || phase == .analyzing || phase == .creating
    }

    var readyItems: [TransferItem] {
        analysis?.items.filter { shouldTransfer($0) } ?? []
    }

    var reviewItems: [TransferItem] {
        analysis?.items.filter { $0.status == "needs_review" && !approvedItemIDs.contains($0.id) && !skippedItemIDs.contains($0.id) } ?? []
    }

    var missingItems: [TransferItem] {
        analysis?.items.filter { $0.status == "unmatched" && !approvedItemIDs.contains($0.id) && !skippedItemIDs.contains($0.id) } ?? []
    }

    var skippedItems: [TransferItem] {
        analysis?.items.filter { skippedItemIDs.contains($0.id) } ?? []
    }

    func previewPlaylist() async {
        let input = playlistInput.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !input.isEmpty else { return }

        phase = .previewing
        statusMessage = "Reading public Spotify link..."
        startOptimisticActivity(.preview)
        analysis = nil
        createdPlaylist = nil
        transferredItemIDs = []
        resetDecisions()
        let startedAt = Date()
        trackEvent("preview_started")

        do {
            preview = try await api.previewPublicPlaylist(input: input)
            destinationPlaylistName = preview?.playlist.kind == "track"
                ? AppleMusicLibraryWriter.inboxPlaylistName
                : AppleMusicLibraryWriter.defaultPlaylistName(for: preview?.playlist.name ?? "Spotify Playlist")
            stopActivity()
            phase = .previewReady
            statusMessage = preview?.playlist.kind == "track"
                ? "Song loaded. Find its Apple Music match when you are ready."
                : "Playlist loaded. Match it with Apple Music when you are ready."
            trackEvent("preview_succeeded", properties: previewProperties(preview, durationMs: elapsedMilliseconds(since: startedAt)))
        } catch {
            stopActivity()
            trackEvent("preview_failed", properties: [
                "durationMs": .int(elapsedMilliseconds(since: startedAt)),
                "errorCategory": .string("spotify_public_preview"),
                "errorMessage": .string(errorMessage(error))
            ])
            fail(error)
        }
    }

    func openIncomingURL(_ url: URL) async {
        guard let playlistURL = playlistInput(fromIncomingURL: url) else {
            trackEvent("preview_failed", properties: [
                "errorCategory": .string("shared_link_extract"),
                "errorMessage": .string("No supported Spotify playlist or song URL found in shared input.")
            ])
            phase = .failed("PlaylistXfer could not find a Spotify playlist or song URL in that shared link.")
            statusMessage = "PlaylistXfer could not find a Spotify playlist or song URL in that shared link."
            return
        }

        playlistInput = playlistURL
        await previewPlaylist()
    }

    func analyzeMatches() async {
        let input = playlistInput.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !input.isEmpty else { return }

        phase = .analyzing
        statusMessage = isSingleTrackImport
            ? "Finding this song in Apple Music..."
            : "Matching this playlist against Apple Music..."
        startOptimisticActivity(.analysis)
        createdPlaylist = nil
        transferredItemIDs = []
        resetDecisions()
        let startedAt = Date()
        trackEvent("analysis_started")

        do {
            analysis = try await api.analyzePublicPlaylist(input: input) { [weak self] job in
                self?.updateActivity(from: job)
            }
            stopActivity()
            phase = .analysisReady
            statusMessage = isSingleTrackImport
                ? "Apple Music match ready. Add the song when it looks right."
                : "Apple Music match report ready. Create from ready tracks when you are comfortable."
            trackEvent("analysis_succeeded", properties: summaryProperties(analysis, durationMs: elapsedMilliseconds(since: startedAt)))
        } catch {
            stopActivity()
            trackEvent("analysis_failed", properties: [
                "durationMs": .int(elapsedMilliseconds(since: startedAt)),
                "errorCategory": .string("apple_music_match"),
                "errorMessage": .string(errorMessage(error))
            ])
            fail(error)
        }
    }

    func createAppleMusicPlaylist() async {
        guard let analysis, canCreate else { return }

        phase = .creating
        statusMessage = "Asking Apple Music for access and preparing the ready tracks..."
        startOptimisticActivity(.create)
        let startedAt = Date()
        trackEvent("transfer_create_started", properties: summaryProperties(analysis, extra: [
            "appleConnected": .bool(false),
            "readyCount": .int(readyItems.count)
        ]))

        do {
            let itemIDsToTransfer = Set(readyItems.map(\.id))
            let progress: @MainActor (String) -> Void = { [weak self] message in
                self?.statusMessage = message
                self?.updateCreateActivity(message)
            }
            let playlist = if isSingleTrackImport {
                try await appleMusic.addTrackToInbox(
                    from: analysis,
                    itemIDsToTransfer: itemIDsToTransfer,
                    candidateOverrides: selectedCandidatesByItemID,
                    progress: progress
                )
            } else {
                try await appleMusic.createPlaylist(
                    from: analysis,
                    itemIDsToTransfer: itemIDsToTransfer,
                    candidateOverrides: selectedCandidatesByItemID,
                    playlistName: destinationPlaylistName,
                    progress: progress
                )
            }
            createdPlaylist = playlist
            transferredItemIDs = itemIDsToTransfer
            stopActivity()
            phase = .created
            statusMessage = isSingleTrackImport
                ? "Added the song to \(playlist.name)."
                : "Created \(playlist.name) with \(playlist.trackCount) ready tracks."
            trackEvent("transfer_create_succeeded", properties: summaryProperties(analysis, durationMs: elapsedMilliseconds(since: startedAt), extra: [
                "appleConnected": .bool(true),
                "readyCount": .int(playlist.trackCount)
            ]))
        } catch {
            stopActivity()
            trackEvent("transfer_create_failed", properties: summaryProperties(analysis, durationMs: elapsedMilliseconds(since: startedAt), extra: [
                "appleConnected": .bool(false),
                "errorCategory": .string("apple_music_create"),
                "errorMessage": .string(errorMessage(error)),
                "readyCount": .int(readyItems.count)
            ]))
            fail(error)
        }
    }

    func updateCreatedAppleMusicPlaylist() async {
        guard let analysis, let existingPlaylist = createdPlaylist, canUpdateCreatedPlaylist else { return }

        let pendingItemIDs = Set(pendingSyncItems.map(\.id))
        phase = .creating
        statusMessage = "Preparing \(pendingItemIDs.count) new \(pendingItemIDs.count == 1 ? "match" : "matches")..."
        startOptimisticActivity(.create)
        let startedAt = Date()
        trackEvent("transfer_update_started", properties: summaryProperties(analysis, extra: [
            "readyCount": .int(pendingItemIDs.count)
        ]))

        do {
            let progress: @MainActor (String) -> Void = { [weak self] message in
                self?.statusMessage = message
                self?.updateCreateActivity(message)
            }
            let updatedPlaylist = try await appleMusic.addTracks(
                to: existingPlaylist,
                from: analysis,
                itemIDsToTransfer: pendingItemIDs,
                candidateOverrides: selectedCandidatesByItemID,
                progress: progress
            )

            transferredItemIDs.formUnion(pendingItemIDs)
            createdPlaylist = updatedPlaylist
            stopActivity()
            phase = .created
            statusMessage = pendingItemIDs.count == 1
                ? "Added the new match to \(updatedPlaylist.name)."
                : "Added \(pendingItemIDs.count) new matches to \(updatedPlaylist.name)."
            trackEvent("transfer_update_succeeded", properties: summaryProperties(analysis, durationMs: elapsedMilliseconds(since: startedAt), extra: [
                "readyCount": .int(pendingItemIDs.count)
            ]))
        } catch {
            stopActivity()
            trackEvent("transfer_update_failed", properties: summaryProperties(analysis, durationMs: elapsedMilliseconds(since: startedAt), extra: [
                "errorCategory": .string("apple_music_update"),
                "errorMessage": .string(errorMessage(error)),
                "readyCount": .int(pendingItemIDs.count)
            ]))
            fail(error)
        }
    }

    func approveSuggestedMatch(_ item: TransferItem) {
        guard selectedCandidate(for: item) != nil else { return }
        approvedItemIDs.insert(item.id)
        skippedItemIDs.remove(item.id)
        phase = createdPlaylist == nil ? .analysisReady : .created
        statusMessage = decisionConfirmation(for: item, candidateName: selectedCandidate(for: item)?.name)
        trackReviewDecision("approve", item: item)
    }

    func selectCandidate(_ candidate: AppleSongCandidate, for item: TransferItem) {
        selectedCandidatesByItemID[item.id] = candidate
        skippedItemIDs.remove(item.id)
        approvedItemIDs.insert(item.id)

        phase = createdPlaylist == nil ? .analysisReady : .created
        statusMessage = decisionConfirmation(for: item, candidateName: candidate.name)
        trackReviewDecision("use-candidate", item: item, candidateIndex: candidateIndex(candidate, in: item))
    }

    func selectedCandidate(for item: TransferItem) -> AppleSongCandidate? {
        selectedCandidatesByItemID[item.id] ?? item.appleCandidate
    }

    func skipTrack(_ item: TransferItem) {
        skippedItemIDs.insert(item.id)
        approvedItemIDs.remove(item.id)
        phase = createdPlaylist == nil ? .analysisReady : .created
        statusMessage = transferredItemIDs.contains(item.id)
            ? "\"\(item.source.name)\" was already transferred, so skipping it here will not remove it from Apple Music."
            : "Skipped \"\(item.source.name)\". It will stay out of the Apple Music playlist."
        trackReviewDecision("skip", item: item)
    }

    func restoreTrack(_ item: TransferItem) {
        skippedItemIDs.remove(item.id)
        phase = createdPlaylist == nil ? .analysisReady : .created
        statusMessage = "Restored \"\(item.source.name)\" to the match report."
        trackReviewDecision("restore", item: item)
    }

    func reset() {
        playlistInput = ""
        preview = nil
        analysis = nil
        createdPlaylist = nil
        transferredItemIDs = []
        destinationPlaylistName = ""
        resetDecisions()
        stopActivity()
        phase = .idle
        statusMessage = "Paste a public Spotify playlist or song link to begin."
    }

    private func decisionConfirmation(for item: TransferItem, candidateName: String?) -> String {
        let matchName = candidateName ?? item.source.name
        if transferredItemIDs.contains(item.id) {
            return "Selected \"\(matchName)\". The earlier match is already in Apple Music and will not be replaced automatically."
        }
        if createdPlaylist != nil {
            return "Added \"\(matchName)\". Update the Apple Music playlist when you are ready."
        }
        return "Added \"\(matchName)\". It will be included when you create the Apple Music playlist."
    }

    func replaceSpotifyInput(with input: String) {
        reset()
        playlistInput = input.trimmingCharacters(in: .whitespacesAndNewlines)
        statusMessage = "Spotify link ready. Preview it when you are ready."
    }

    private func startOptimisticActivity(_ kind: TransferActivityKind) {
        stopActivity()
        let startedAt = Date()
        updateOptimisticActivity(kind, elapsedSeconds: 0)

        progressPulseTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .milliseconds(1100))
                guard !Task.isCancelled else { return }

                await MainActor.run {
                    let elapsedSeconds = Date().timeIntervalSince(startedAt)
                    self?.updateOptimisticActivity(kind, elapsedSeconds: elapsedSeconds)
                }
            }
        }
    }

    private func stopActivity() {
        progressPulseTask?.cancel()
        progressPulseTask = nil
        activity = nil
    }

    private func stopOptimisticProgress() {
        progressPulseTask?.cancel()
        progressPulseTask = nil
    }

    private func updateOptimisticActivity(_ kind: TransferActivityKind, elapsedSeconds: TimeInterval) {
        let phases = optimisticPhases(for: kind)
        let current = phases.last(where: { elapsedSeconds >= $0.at }) ?? phases[0]
        let gentleBump = min(8, Int(max(0, elapsedSeconds - current.at) / 4))
        let nextProgress = min(kind == .analysis ? 12 : 58, current.progress + gentleBump)
        let previousProgress = activity?.kind == kind ? (activity?.progress ?? 0) : 0
        let displayedProgress = max(previousProgress, nextProgress)

        activity = TransferActivity(
            kind: kind,
            eyebrow: activityEyebrow(for: kind),
            title: current.title,
            detail: current.detail,
            progress: displayedProgress,
            isEstimated: true
        )
    }

    private func updateActivity(from job: TransferJob<TransferAnalysis>) {
        stopOptimisticProgress()
        let completedProgress = job.total > 0
            ? Int((Double(job.completed) / Double(job.total) * 100).rounded())
            : 0
        let reportedProgress = max(job.progress, completedProgress)
        let previousProgress = activity?.kind == .analysis ? (activity?.progress ?? 0) : 0

        activity = TransferActivity(
            kind: .analysis,
            eyebrow: activityEyebrow(for: .analysis),
            title: "Matching with Apple Music",
            detail: job.total > 0
                ? "\(job.completed) of \(job.total) tracks checked."
                : "Preparing Apple Music match data.",
            progress: max(previousProgress, max(0, min(100, reportedProgress))),
            isEstimated: false
        )
    }

    func resetDestinationPlaylistName() {
        if isSingleTrackImport {
            destinationPlaylistName = AppleMusicLibraryWriter.inboxPlaylistName
            return
        }

        if let sourceName = analysis?.playlist.name ?? preview?.playlist.name {
            destinationPlaylistName = AppleMusicLibraryWriter.defaultPlaylistName(for: sourceName)
        }
    }

    private func updateCreateActivity(_ message: String) {
        let progress: Int
        if message.localizedCaseInsensitiveContains("permission") {
            progress = 18
        } else if message.localizedCaseInsensitiveContains("subscription") || message.localizedCaseInsensitiveContains("sync library") {
            progress = 34
        } else if message.localizedCaseInsensitiveContains("loading") {
            progress = 58
        } else if message.localizedCaseInsensitiveContains("creating") {
            progress = 78
        } else {
            progress = activity?.progress ?? 24
        }

        activity = TransferActivity(
            kind: .create,
            eyebrow: activityEyebrow(for: .create),
            title: "Creating your Apple Music playlist.",
            detail: message,
            progress: progress,
            isEstimated: true
        )
    }

    private func optimisticPhases(for kind: TransferActivityKind) -> [(at: TimeInterval, progress: Int, title: String, detail: String)] {
        switch kind {
        case .preview:
            return [
                (0, 8, "Reading the Spotify link.", "Fetching public playlist metadata."),
                (4, 22, "Opening the playlist.", "Spotify can take a moment to return public tracks."),
                (10, 36, "Loading the track list.", "Still working. Keep this app open."),
                (20, 48, "Checking playlist data.", "Large playlists can take a little longer.")
            ]
        case .analysis:
            return [
                (0, 2, "Matching with Apple Music", "Preparing the Apple Music catalog search."),
                (4, 4, "Matching with Apple Music", "Preparing the Apple Music catalog search."),
                (10, 6, "Matching with Apple Music", "Preparing the Apple Music catalog search."),
                (20, 8, "Matching with Apple Music", "Preparing the Apple Music catalog search.")
            ]
        case .create:
            return [
                (0, 8, "Preparing Apple Music.", "Getting ready to create the playlist."),
                (4, 20, "Starting playlist creation.", "Apple Music is receiving the ready tracks."),
                (10, 34, "Adding tracks.", "This can take a moment for larger playlists."),
                (20, 46, "Building the receipt.", "Keep this app open until the transfer completes.")
            ]
        }
    }

    private func activityEyebrow(for kind: TransferActivityKind) -> String {
        switch kind {
        case .preview:
            return "Step 1 of 3 - Preview"
        case .analysis:
            return "Step 2 of 3 - Match"
        case .create:
            return "Step 3 of 3 - Create"
        }
    }

    private func shouldTransfer(_ item: TransferItem) -> Bool {
        guard !skippedItemIDs.contains(item.id) else { return false }
        return item.status == "matched" || approvedItemIDs.contains(item.id)
    }

    private func resetDecisions() {
        approvedItemIDs = []
        skippedItemIDs = []
        selectedCandidatesByItemID = [:]
    }

    private func playlistInput(fromIncomingURL url: URL) -> String? {
        if url.scheme?.lowercased() == "playlistxfer" {
            let components = URLComponents(url: url, resolvingAgainstBaseURL: false)
            if let sharedURL = components?.queryItems?.first(where: { $0.name == "url" })?.value,
               isSupportedSpotifyInput(sharedURL) {
                return sharedURL
            }
        }

        let rawURL = url.absoluteString
        if isSupportedSpotifyInput(rawURL) {
            return rawURL
        }

        return nil
    }

    private func isSupportedSpotifyInput(_ input: String) -> Bool {
        let normalized = input.lowercased()
        return normalized.contains("open.spotify.com/playlist/")
            || normalized.contains("open.spotify.com/track/")
            || normalized.contains("spotify.link/")
            || normalized.hasPrefix("spotify:playlist:")
            || normalized.hasPrefix("spotify:track:")
    }

    private func trackEvent(_ event: String, properties: [String: AnalyticsPropertyValue] = [:]) {
        let enrichedProperties = analyticsContext(properties)
        let api = api

        Task {
            await api.recordUsageEvent(event, properties: enrichedProperties)
        }
    }

    private func trackReviewDecision(_ action: String, item: TransferItem, candidateIndex: Int? = nil) {
        var properties = summaryProperties(analysis)
        properties["reviewAction"] = .string(action)
        properties["itemIndex"] = .int(item.index)

        if let candidateIndex {
            properties["candidateIndex"] = .int(candidateIndex)
        }

        trackEvent("review_decision_succeeded", properties: properties)
    }

    private func analyticsContext(_ properties: [String: AnalyticsPropertyValue]) -> [String: AnalyticsPropertyValue] {
        var context: [String: AnalyticsPropertyValue] = [
            "host": .string("ios"),
            "path": .string("ios/import"),
            "analysisLimit": .int(AppConfig.defaultAnalysisLimit)
        ]

        if let playlistID = spotifyPlaylistID(from: playlistInput) {
            context["playlistId"] = .string(playlistID)
        }

        if let transferID = analysis?.transferId {
            context["transferId"] = .string(transferID)
        }

        properties.forEach { key, value in
            context[key] = value
        }

        return context
    }

    private func previewProperties(_ preview: PlaylistPreviewResponse?, durationMs: Int) -> [String: AnalyticsPropertyValue] {
        guard let preview else {
            return ["durationMs": .int(durationMs)]
        }

        return [
            "durationMs": .int(durationMs),
            "totalTracks": .int(preview.playlist.totalItems ?? preview.tracks.count),
            "readableTracks": .int(preview.tracks.count),
            "withIsrcCount": .int(preview.tracks.filter { $0.isrc != nil }.count),
            "playlistSource": .string(preview.playlist.source ?? "")
        ]
    }

    private func summaryProperties(
        _ analysis: TransferAnalysis?,
        durationMs: Int? = nil,
        extra: [String: AnalyticsPropertyValue] = [:]
    ) -> [String: AnalyticsPropertyValue] {
        var properties = extra

        guard let analysis else {
            if let durationMs {
                properties["durationMs"] = .int(durationMs)
            }
            return properties
        }

        properties["transferId"] = .string(analysis.transferId ?? "")
        properties["totalTracks"] = .int(analysis.playlist.originalTotalItems ?? analysis.playlist.totalItems ?? analysis.items.count)
        properties["readableTracks"] = .int(analysis.playlist.analyzedTrackCount ?? analysis.items.count)
        properties["readyCount"] = .int(analysis.summary.confidentMatchCount)
        properties["reviewCount"] = .int(analysis.summary.needsReviewCount)
        properties["missingCount"] = .int(analysis.summary.unmatchedCount)
        properties["matchRate"] = .double(analysis.summary.matchRate)
        properties["playlistSource"] = .string(analysis.playlist.source ?? "")

        if let durationMs {
            properties["durationMs"] = .int(durationMs)
        }

        return properties
    }

    private func elapsedMilliseconds(since date: Date) -> Int {
        Int(Date().timeIntervalSince(date) * 1000)
    }

    private func errorMessage(_ error: Error) -> String {
        (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
    }

    private func spotifyPlaylistID(from input: String) -> String? {
        let trimmed = input.trimmingCharacters(in: .whitespacesAndNewlines)

        if trimmed.lowercased().hasPrefix("spotify:playlist:") {
            return String(trimmed.dropFirst("spotify:playlist:".count))
        }

        if let url = URL(string: trimmed),
           let playlistPathIndex = url.pathComponents.firstIndex(of: "playlist"),
           url.pathComponents.indices.contains(playlistPathIndex + 1) {
            return url.pathComponents[playlistPathIndex + 1]
        }

        guard let range = trimmed.range(
            of: #"playlist\/([A-Za-z0-9]+)"#,
            options: .regularExpression
        ) else {
            return nil
        }

        let matched = String(trimmed[range])
        return matched.components(separatedBy: "/").last
    }

    private func candidateIndex(_ candidate: AppleSongCandidate, in item: TransferItem) -> Int? {
        item.candidates?.firstIndex { $0.id == candidate.id }
    }

    private func fail(_ error: Error) {
        let message = errorMessage(error)
        phase = .failed(message)
        statusMessage = message
    }
}

#if DEBUG
extension TransferViewModel {
    private func applyScreenshotScenarioFromLaunchArguments() {
        guard let scenario = ProcessInfo.processInfo.arguments
            .compactMap({ argument -> String? in
                guard argument.hasPrefix("--screenshot-scenario=") else { return nil }
                return String(argument.dropFirst("--screenshot-scenario=".count))
            })
            .first
        else {
            return
        }

        let fixture = ScreenshotFixture.make()
        playlistInput = "https://open.spotify.com/playlist/playlistxfer-demo"
        preview = fixture.preview
        destinationPlaylistName = AppleMusicLibraryWriter.defaultPlaylistName(for: fixture.preview.playlist.name)

        switch scenario {
        case "home":
            playlistInput = ""
            preview = nil
            analysis = nil
            phase = .idle
            statusMessage = "Paste a public Spotify playlist or song link to begin."
        case "preview":
            phase = .previewReady
            statusMessage = "Playlist loaded. Match it with Apple Music when you are ready."
        case "matching":
            phase = .analyzing
            statusMessage = "Matching this playlist against Apple Music..."
            activity = TransferActivity(
                kind: .analysis,
                eyebrow: activityEyebrow(for: .analysis),
                title: "Matching with Apple Music",
                detail: "18 of 42 tracks checked.",
                progress: 43,
                isEstimated: false
            )
        case "match":
            analysis = fixture.analysis
            phase = .analysisReady
            statusMessage = "Apple Music match report ready. Create from ready tracks when you are comfortable."
        case "created":
            analysis = fixture.analysis
            if let reviewItem = fixture.analysis.items.first(where: { $0.status == "needs_review" }) {
                approvedItemIDs.insert(reviewItem.id)
                if let candidate = reviewItem.appleCandidate {
                    selectedCandidatesByItemID[reviewItem.id] = candidate
                }
            }
            transferredItemIDs = Set(fixture.analysis.items.map(\.id))
            createdPlaylist = CreatedAppleMusicPlaylist(
                id: "p.screenshot-playlist",
                name: destinationPlaylistName,
                url: URL(string: "https://music.apple.com/library/playlist/p.screenshot-playlist"),
                trackCount: fixture.analysis.items.count
            )
            phase = .created
            statusMessage = "Created \(destinationPlaylistName) with \(fixture.analysis.items.count) tracks."
        case "single-track":
            let singleTrackFixture = ScreenshotFixture.makeSingleTrack()
            playlistInput = "https://open.spotify.com/track/playlistxfer-demo"
            preview = singleTrackFixture.preview
            analysis = singleTrackFixture.analysis
            destinationPlaylistName = AppleMusicLibraryWriter.inboxPlaylistName
            phase = .analysisReady
            statusMessage = "Apple Music match ready. Add the song when it looks right."
        default:
            break
        }
    }
}

private enum ScreenshotFixture {
    static func makeSingleTrack() -> (preview: PlaylistPreviewResponse, analysis: TransferAnalysis) {
        let track = spotifyTrack("The Nights", "Avicii", "The Days / Nights")
        let playlist = SpotifyPlaylist(
            id: "playlistxfer-demo-track",
            name: track.name,
            kind: "track",
            description: nil,
            imageUrl: nil,
            totalItems: 1,
            source: "screenshot-fixture",
            limitations: nil
        )
        let analyzedPlaylist = AnalyzedPlaylist(
            id: playlist.id,
            name: playlist.name,
            kind: playlist.kind,
            imageUrl: playlist.imageUrl,
            totalItems: 1,
            originalTotalItems: 1,
            analyzedTrackCount: 1,
            partialAnalysis: false,
            source: playlist.source,
            limitations: nil
        )
        let item = transferItem(
            index: 0,
            status: "matched",
            source: track,
            candidate: appleCandidate(
                id: "apple-single-track",
                name: track.name,
                artist: track.artistText,
                album: track.album ?? "Unknown album"
            ),
            confidence: 1,
            reason: "isrc",
            candidates: nil
        )
        let analysis = TransferAnalysis(
            playlist: analyzedPlaylist,
            summary: TransferSummary(
                matchedCount: 1,
                unmatchedCount: 0,
                needsReviewCount: 0,
                confidentMatchCount: 1,
                matchRate: 1
            ),
            items: [item],
            transferId: "screenshot-single-track-transfer",
            transfer: nil,
            createdApplePlaylistId: nil
        )
        return (PlaylistPreviewResponse(playlist: playlist, tracks: [track]), analysis)
    }

    static func make() -> (preview: PlaylistPreviewResponse, analysis: TransferAnalysis) {
        let showcaseTracks = [
            spotifyTrack("The Nights", "Avicii", "The Days / Nights"),
            spotifyTrack("On Top Of The World", "Imagine Dragons", "Night Visions"),
            spotifyTrack("Heat Waves", "Glass Animals", "Dreamland"),
            spotifyTrack("Samba Pa Ti", "Santana", "Abraxas"),
            spotifyTrack("Little Wing", "Jimi Hendrix", "Hendrix In The West"),
            spotifyTrack("Dreamers - Xaphoon Jones Remix", "Savoir Adore, Xaphoon Jones", "Dreamers"),
            spotifyTrack("Don't Go Breaking My Heart", "Elton John, Kiki Dee", "Rock Of The Westies"),
            spotifyTrack("Tiny Dancer", "Elton John", "Almost Famous")
        ]

        let reviewTrack = spotifyTrack(
            "Breakfast In America - Live At Pavillon de Paris/1979",
            "Supertramp",
            "Paris"
        )
        let supportingTracks = (showcaseTracks.count..<41).map { index in
            spotifyTrack(
                "Weekend Drive Track \(index + 1)",
                "PlaylistXfer Demo",
                "Weekend Drive"
            )
        }
        let tracks = showcaseTracks + supportingTracks + [reviewTrack]

        let playlist = SpotifyPlaylist(
            id: "playlistxfer-demo",
            name: "Weekend Drive",
            kind: "playlist",
            description: "A compact screenshot fixture for App Store captures.",
            imageUrl: nil,
            totalItems: 42,
            source: "screenshot-fixture",
            limitations: nil
        )

        let preview = PlaylistPreviewResponse(
            playlist: playlist,
            tracks: tracks
        )

        let analyzedPlaylist = AnalyzedPlaylist(
            id: playlist.id,
            name: playlist.name,
            kind: playlist.kind,
            imageUrl: playlist.imageUrl,
            totalItems: playlist.totalItems,
            originalTotalItems: playlist.totalItems,
            analyzedTrackCount: 42,
            partialAnalysis: false,
            source: playlist.source,
            limitations: nil
        )

        let reviewItem = transferItem(
            index: 5,
            status: "needs_review",
            source: reviewTrack,
            candidate: appleCandidate(
                id: "apple-review-1",
                name: "Even In the Quietest Moments (Live at Pavillon de Paris - 1979)",
                artist: "Supertramp",
                album: "Breakfast in America (Deluxe Edition) [2010 Remaster]"
            ),
            confidence: 0.55,
            reason: "artist-only-fallback",
            candidates: [
                appleCandidate(
                    id: "apple-review-1",
                    name: "Even In the Quietest Moments (Live at Pavillon de Paris - 1979)",
                    artist: "Supertramp",
                    album: "Breakfast in America (Deluxe Edition) [2010 Remaster]"
                ),
                appleCandidate(
                    id: "apple-review-2",
                    name: "Downstream (Live at Pavillon de Paris - 1979)",
                    artist: "Supertramp",
                    album: "Breakfast in America (Deluxe Edition) [2010 Remaster]"
                ),
                appleCandidate(
                    id: "apple-review-3",
                    name: "The Logical Song (Live at Pavillon de Paris - 1979)",
                    artist: "Supertramp",
                    album: "Breakfast in America (Deluxe Edition) [2010 Remaster]"
                )
            ]
        )

        let readyItems = tracks.dropLast().enumerated().map { offset, track in
            transferItem(
                index: offset + 1,
                status: "matched",
                source: track,
                candidate: appleCandidate(
                    id: "apple-ready-\(offset + 1)",
                    name: track.name,
                    artist: track.artistText,
                    album: track.album ?? "Unknown album"
                ),
                confidence: 1,
                reason: "isrc",
                candidates: nil
            )
        }

        let analysis = TransferAnalysis(
            playlist: analyzedPlaylist,
            summary: TransferSummary(
                matchedCount: 41,
                unmatchedCount: 0,
                needsReviewCount: 1,
                confidentMatchCount: 41,
                matchRate: 1
            ),
            items: [reviewItem] + readyItems,
            transferId: "screenshot-transfer",
            transfer: nil,
            createdApplePlaylistId: nil
        )

        return (preview, analysis)
    }

    private static func spotifyTrack(_ name: String, _ artists: String, _ album: String) -> SpotifyTrack {
        SpotifyTrack(
            spotifyTrackId: "spotify-\(name.lowercased().replacingOccurrences(of: " ", with: "-"))",
            isrc: "SAMPLEISRC",
            name: name,
            artists: artists.components(separatedBy: ", "),
            album: album,
            albumImageUrl: nil,
            durationMs: 210_000
        )
    }

    private static func transferItem(
        index: Int,
        status: String,
        source: SpotifyTrack,
        candidate: AppleSongCandidate?,
        confidence: Double?,
        reason: String,
        candidates: [AppleSongCandidate]?
    ) -> TransferItem {
        TransferItem(
            index: index,
            status: status,
            source: source,
            confidence: confidence,
            reason: reason,
            appleCandidate: candidate,
            candidateCount: candidates?.count ?? (candidate == nil ? 0 : 1),
            candidates: candidates
        )
    }

    private static func appleCandidate(
        id: String,
        name: String,
        artist: String,
        album: String
    ) -> AppleSongCandidate {
        AppleSongCandidate(
            id: id,
            name: name,
            artistName: artist,
            albumName: album,
            durationMs: 210_000,
            isrc: "SAMPLEISRC",
            url: URL(string: "https://music.apple.com/us/song/\(id)"),
            artworkUrl: nil
        )
    }
}
#endif
