import Foundation

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
    @Published private(set) var phase: Phase = .idle
    @Published private(set) var preview: PlaylistPreviewResponse?
    @Published private(set) var analysis: TransferAnalysis?
    @Published private(set) var createdPlaylist: CreatedAppleMusicPlaylist?
    @Published private(set) var approvedReviewItemIDs: Set<Int> = []
    @Published private(set) var skippedItemIDs: Set<Int> = []
    @Published private(set) var selectedCandidatesByItemID: [Int: AppleSongCandidate] = [:]
    @Published private(set) var statusMessage = "Paste a public Spotify playlist link to begin."

    private let api: TransferAPIClient
    private let appleMusic: AppleMusicLibraryWriter

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
        analysis = nil
        createdPlaylist = nil
        resetDecisions()
        let startedAt = Date()
        trackEvent("preview_started")

        do {
            preview = try await api.previewPublicPlaylist(input: input)
            phase = .previewReady
            statusMessage = "Playlist loaded. Match it with Apple Music when you are ready."
            trackEvent("preview_succeeded", properties: previewProperties(preview, durationMs: elapsedMilliseconds(since: startedAt)))
        } catch {
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
        createdPlaylist = nil
        resetDecisions()
        let startedAt = Date()
        trackEvent("analysis_started")

        do {
            analysis = try await api.analyzePublicPlaylist(input: input)
            phase = .analysisReady
            statusMessage = "Apple Music match report ready. Create from ready tracks when you are comfortable."
            trackEvent("analysis_succeeded", properties: summaryProperties(analysis, durationMs: elapsedMilliseconds(since: startedAt)))
        } catch {
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
                candidateOverrides: selectedCandidatesByItemID
            ) { [weak self] message in
                self?.statusMessage = message
            }
            createdPlaylist = playlist
            phase = .created
            statusMessage = "Created \(playlist.name) with \(playlist.trackCount) ready tracks."
            trackEvent("transfer_create_succeeded", properties: summaryProperties(analysis, durationMs: elapsedMilliseconds(since: startedAt), extra: [
                "appleConnected": .bool(true),
                "readyCount": .int(playlist.trackCount)
            ]))
        } catch {
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
        resetDecisions()
        phase = .idle
        statusMessage = "Paste a public Spotify playlist link to begin."
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
