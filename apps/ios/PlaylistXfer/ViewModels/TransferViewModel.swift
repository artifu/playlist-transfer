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
        "\(isEstimated ? "~" : "")\(progress)%"
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
    @Published private(set) var approvedReviewItemIDs: Set<Int> = []
    @Published private(set) var skippedItemIDs: Set<Int> = []
    @Published private(set) var selectedCandidatesByItemID: [Int: AppleSongCandidate] = [:]
    @Published private(set) var statusMessage = "Paste a public Spotify playlist link to begin."
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

    var isBusy: Bool {
        phase == .previewing || phase == .analyzing || phase == .creating
    }

    var readyItems: [TransferItem] {
        analysis?.items.filter { shouldTransfer($0) } ?? []
    }

    var reviewItems: [TransferItem] {
        analysis?.items.filter { $0.status == "needs_review" && !approvedReviewItemIDs.contains($0.id) && !skippedItemIDs.contains($0.id) } ?? []
    }

    var missingItems: [TransferItem] {
        analysis?.items.filter { $0.status == "unmatched" && !skippedItemIDs.contains($0.id) } ?? []
    }

    var skippedItems: [TransferItem] {
        analysis?.items.filter { skippedItemIDs.contains($0.id) } ?? []
    }

    func previewPlaylist() async {
        let input = playlistInput.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !input.isEmpty else { return }

        phase = .previewing
        statusMessage = "Reading public Spotify playlist..."
        startOptimisticActivity(.preview)
        analysis = nil
        createdPlaylist = nil
        resetDecisions()
        let startedAt = Date()
        trackEvent("preview_started")

        do {
            preview = try await api.previewPublicPlaylist(input: input)
            destinationPlaylistName = AppleMusicLibraryWriter.defaultPlaylistName(for: preview?.playlist.name ?? "Spotify Playlist")
            stopActivity()
            phase = .previewReady
            statusMessage = "Playlist loaded. Match it with Apple Music when you are ready."
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
                "errorMessage": .string("No supported Spotify playlist URL found in shared input.")
            ])
            phase = .failed("PlaylistXfer could not find a Spotify playlist URL in that shared link.")
            statusMessage = "PlaylistXfer could not find a Spotify playlist URL in that shared link."
            return
        }

        playlistInput = playlistURL
        await previewPlaylist()
    }

    func analyzeMatches() async {
        let input = playlistInput.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !input.isEmpty else { return }

        phase = .analyzing
        statusMessage = "Matching this playlist against Apple Music..."
        startOptimisticActivity(.analysis)
        createdPlaylist = nil
        resetDecisions()
        let startedAt = Date()
        trackEvent("analysis_started")

        do {
            analysis = try await api.analyzePublicPlaylist(input: input) { [weak self] job in
                self?.updateActivity(from: job)
            }
            stopActivity()
            phase = .analysisReady
            statusMessage = "Apple Music match report ready. Create from ready tracks when you are comfortable."
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
            let playlist = try await appleMusic.createPlaylist(
                from: analysis,
                itemIDsToTransfer: itemIDsToTransfer,
                candidateOverrides: selectedCandidatesByItemID,
                playlistName: destinationPlaylistName
            ) { [weak self] message in
                self?.statusMessage = message
                self?.updateCreateActivity(message)
            }
            createdPlaylist = playlist
            stopActivity()
            phase = .created
            statusMessage = "Created \(playlist.name) with \(playlist.trackCount) ready tracks."
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

    func approveSuggestedMatch(_ item: TransferItem) {
        guard selectedCandidate(for: item) != nil else { return }
        approvedReviewItemIDs.insert(item.id)
        skippedItemIDs.remove(item.id)
        createdPlaylist = nil
        phase = .analysisReady
        statusMessage = "Approved \"\(item.source.name)\". It will be included when you create the Apple Music playlist."
        trackReviewDecision("approve", item: item)
    }

    func selectCandidate(_ candidate: AppleSongCandidate, for item: TransferItem) {
        selectedCandidatesByItemID[item.id] = candidate
        skippedItemIDs.remove(item.id)

        if item.status == "needs_review" {
            approvedReviewItemIDs.insert(item.id)
        }

        createdPlaylist = nil
        phase = .analysisReady
        statusMessage = "Selected \"\(candidate.name)\" for \"\(item.source.name)\"."
        trackReviewDecision("use-candidate", item: item, candidateIndex: candidateIndex(candidate, in: item))
    }

    func selectedCandidate(for item: TransferItem) -> AppleSongCandidate? {
        selectedCandidatesByItemID[item.id] ?? item.appleCandidate
    }

    func skipTrack(_ item: TransferItem) {
        skippedItemIDs.insert(item.id)
        approvedReviewItemIDs.remove(item.id)
        createdPlaylist = nil
        phase = .analysisReady
        statusMessage = "Skipped \"\(item.source.name)\". It will stay out of the Apple Music playlist."
        trackReviewDecision("skip", item: item)
    }

    func restoreTrack(_ item: TransferItem) {
        skippedItemIDs.remove(item.id)
        createdPlaylist = nil
        phase = .analysisReady
        statusMessage = "Restored \"\(item.source.name)\" to the match report."
        trackReviewDecision("restore", item: item)
    }

    func reset() {
        preview = nil
        analysis = nil
        createdPlaylist = nil
        destinationPlaylistName = ""
        resetDecisions()
        stopActivity()
        phase = .idle
        statusMessage = "Paste a public Spotify playlist link to begin."
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

    private func updateOptimisticActivity(_ kind: TransferActivityKind, elapsedSeconds: TimeInterval) {
        let phases = optimisticPhases(for: kind)
        let current = phases.last(where: { elapsedSeconds >= $0.at }) ?? phases[0]
        let gentleBump = min(8, Int(max(0, elapsedSeconds - current.at) / 4))

        activity = TransferActivity(
            kind: kind,
            eyebrow: activityEyebrow(for: kind),
            title: current.title,
            detail: current.detail,
            progress: min(58, current.progress + gentleBump),
            isEstimated: true
        )
    }

    private func updateActivity(from job: TransferJob<TransferAnalysis>) {
        activity = TransferActivity(
            kind: .analysis,
            eyebrow: activityEyebrow(for: .analysis),
            title: "Matching with Apple Music",
            detail: job.total > 0
                ? "\(job.completed) of \(job.total) tracks checked."
                : "Preparing Apple Music match data.",
            progress: max(0, min(100, job.progress)),
            isEstimated: false
        )
    }

    func resetDestinationPlaylistName() {
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
                (0, 8, "Matching with Apple Music", "Starting the match report."),
                (4, 18, "Matching with Apple Music", "Large playlists can take a minute on the free tier."),
                (10, 30, "Matching with Apple Music", "Waiting for the first batch of catalog results."),
                (20, 42, "Matching with Apple Music", "Still working. Keep this app open.")
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
        return item.status == "matched" || approvedReviewItemIDs.contains(item.id)
    }

    private func resetDecisions() {
        approvedReviewItemIDs = []
        skippedItemIDs = []
        selectedCandidatesByItemID = [:]
    }

    private func playlistInput(fromIncomingURL url: URL) -> String? {
        if url.scheme?.lowercased() == "playlistxfer" {
            let components = URLComponents(url: url, resolvingAgainstBaseURL: false)
            if let sharedURL = components?.queryItems?.first(where: { $0.name == "url" })?.value,
               isSupportedSpotifyPlaylistInput(sharedURL) {
                return sharedURL
            }
        }

        let rawURL = url.absoluteString
        if isSupportedSpotifyPlaylistInput(rawURL) {
            return rawURL
        }

        return nil
    }

    private func isSupportedSpotifyPlaylistInput(_ input: String) -> Bool {
        let normalized = input.lowercased()
        return normalized.contains("open.spotify.com/playlist/")
            || normalized.contains("spotify.link/")
            || normalized.hasPrefix("spotify:playlist:")
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
