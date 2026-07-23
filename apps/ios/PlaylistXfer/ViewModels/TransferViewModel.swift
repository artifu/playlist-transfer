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
    @Published private(set) var lastWriteOutcome: AppleMusicPlaylistWriteOutcome?
    @Published private(set) var statusMessage = "Paste a public Spotify playlist or song link to begin."
    @Published private(set) var activity: TransferActivity?
    @Published private(set) var historyEntries: [TransferHistoryEntry] = []

    private let api: TransferAPIClient
    private let appleMusic: AppleMusicLibraryWriter
    private let historyStore: TransferHistoryStore
    private var progressPulseTask: Task<Void, Never>?
    private var currentSourceSurface: String?
    private var lastActiveTelemetryAt: Date?
    private var activeHistoryEntryID: UUID?

    private static let hasLaunchedKey = "playlistxfer.analytics.has-launched"

    init(
        api: TransferAPIClient = TransferAPIClient(),
        appleMusic: AppleMusicLibraryWriter = AppleMusicLibraryWriter(),
        historyStore: TransferHistoryStore = TransferHistoryStore()
    ) {
        self.api = api
        self.appleMusic = appleMusic
        self.historyStore = historyStore
        self.historyEntries = historyStore.entries

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

    func recordAppBecameActive() {
        let now = Date()
        if let lastActiveTelemetryAt,
           now.timeIntervalSince(lastActiveTelemetryAt) < 30 {
            return
        }
        lastActiveTelemetryAt = now

        let defaults = UserDefaults.standard
        let isFirstLaunch = !defaults.bool(forKey: Self.hasLaunchedKey)
        defaults.set(true, forKey: Self.hasLaunchedKey)

        trackEvent("app_opened", properties: [
            "appVersion": .string(Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "unknown"),
            "buildNumber": .string(Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "unknown"),
            "isFirstLaunch": .bool(isFirstLaunch),
            "sourceSurface": .string("app")
        ])
    }

    func previewPlaylist() async {
        let input = playlistInput.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !input.isEmpty else { return }

        if currentSourceSurface == nil {
            currentSourceSurface = "manual_input"
        }

        phase = .previewing
        statusMessage = "Reading public Spotify link..."
        startOptimisticActivity(.preview)
        preview = nil
        analysis = nil
        createdPlaylist = nil
        transferredItemIDs = []
        lastWriteOutcome = nil
        resetDecisions()
        let startedAt = Date()
        trackEvent("transfer_form_started")
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
            saveHistory(status: .previewed)
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
        currentSourceSurface = "share_sheet"

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
        lastWriteOutcome = nil
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
            saveHistory(status: .ready)
            trackEvent("analysis_succeeded", properties: summaryProperties(analysis, durationMs: elapsedMilliseconds(since: startedAt)))
        } catch {
            stopActivity()
            saveHistory(status: .failed, errorMessage: errorMessage(error))
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
            let outcome = if isSingleTrackImport {
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
            let playlist = outcome.playlist
            createdPlaylist = playlist
            lastWriteOutcome = outcome
            transferredItemIDs = itemIDsToTransfer
            stopActivity()
            phase = .created
            if outcome.addedTrackCount == 0 && outcome.skippedDuplicateCount > 0 {
                statusMessage = "Already in \(playlist.name) — nothing added."
            } else if isSingleTrackImport {
                statusMessage = "Added the song to \(playlist.name)."
            } else if outcome.skippedDuplicateCount > 0 {
                statusMessage = "Created \(playlist.name) with \(outcome.addedTrackCount) tracks. Skipped \(outcome.skippedDuplicateCount) duplicate \(outcome.skippedDuplicateCount == 1 ? "match" : "matches")."
            } else {
                statusMessage = "Created \(playlist.name) with \(playlist.trackCount) ready tracks."
            }
            saveHistory(status: .completed)
            trackEvent("transfer_create_succeeded", properties: summaryProperties(analysis, durationMs: elapsedMilliseconds(since: startedAt), extra: [
                "appleConnected": .bool(true),
                "readyCount": .int(playlist.trackCount),
                "addedCount": .int(outcome.addedTrackCount),
                "duplicateCount": .int(outcome.skippedDuplicateCount)
            ]))
            trackPreventedDuplicates(
                outcome.skippedDuplicateCount,
                addedCount: outcome.addedTrackCount,
                destination: isSingleTrackImport ? "inbox" : "new_playlist"
            )
        } catch {
            stopActivity()
            saveHistory(status: .failed, errorMessage: errorMessage(error))
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
            let outcome = try await appleMusic.addTracks(
                to: existingPlaylist,
                from: analysis,
                itemIDsToTransfer: pendingItemIDs,
                candidateOverrides: selectedCandidatesByItemID,
                progress: progress
            )
            let updatedPlaylist = outcome.playlist

            transferredItemIDs.formUnion(pendingItemIDs)
            createdPlaylist = updatedPlaylist
            lastWriteOutcome = outcome
            stopActivity()
            phase = .created
            if outcome.addedTrackCount == 0 && outcome.skippedDuplicateCount > 0 {
                statusMessage = "Already in \(updatedPlaylist.name) — nothing added."
            } else if outcome.skippedDuplicateCount > 0 {
                statusMessage = "Added \(outcome.addedTrackCount) new \(outcome.addedTrackCount == 1 ? "match" : "matches") to \(updatedPlaylist.name). Skipped \(outcome.skippedDuplicateCount) already there."
            } else if outcome.addedTrackCount == 1 {
                statusMessage = "Added the new match to \(updatedPlaylist.name)."
            } else {
                statusMessage = "Added \(outcome.addedTrackCount) new matches to \(updatedPlaylist.name)."
            }
            saveHistory(status: .completed)
            trackEvent("transfer_update_succeeded", properties: summaryProperties(analysis, durationMs: elapsedMilliseconds(since: startedAt), extra: [
                "readyCount": .int(pendingItemIDs.count),
                "addedCount": .int(outcome.addedTrackCount),
                "duplicateCount": .int(outcome.skippedDuplicateCount)
            ]))
            trackPreventedDuplicates(
                outcome.skippedDuplicateCount,
                addedCount: outcome.addedTrackCount,
                destination: "existing_playlist"
            )
        } catch {
            stopActivity()
            saveHistory(status: .failed, errorMessage: errorMessage(error))
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
        saveHistory(status: currentHistoryStatus)
        trackReviewDecision("approve", item: item)
    }

    func selectCandidate(_ candidate: AppleSongCandidate, for item: TransferItem) {
        selectedCandidatesByItemID[item.id] = candidate
        skippedItemIDs.remove(item.id)
        approvedItemIDs.insert(item.id)

        phase = createdPlaylist == nil ? .analysisReady : .created
        statusMessage = decisionConfirmation(for: item, candidateName: candidate.name)
        saveHistory(status: currentHistoryStatus)
        let index = candidateIndex(candidate, in: item)
        trackReviewDecision("use-candidate", item: item, candidateIndex: index)
        trackMatchFeedback(
            selectedCandidate: candidate,
            item: item,
            selectionSource: "suggested_alternative",
            resultRank: index.map { $0 + 1 }
        )
    }

    func searchAppleMusic(_ query: String, for item: TransferItem) async throws -> [AppleSongCandidate] {
        let trimmedQuery = query.trimmingCharacters(in: .whitespacesAndNewlines)
        let defaultQuery = manualSearchDefaultQuery(for: item)
        let queryEdited = trimmedQuery.localizedCaseInsensitiveCompare(defaultQuery) != .orderedSame
        let startedAt = Date()

        trackEvent("manual_match_search_started", properties: manualSearchProperties(item, extra: [
            "queryEdited": .bool(queryEdited),
            "queryLength": .int(trimmedQuery.count)
        ]))

        do {
            let results = try await api.searchAppleMusic(term: trimmedQuery)
            trackEvent("manual_match_search_succeeded", properties: manualSearchProperties(item, extra: [
                "durationMs": .int(elapsedMilliseconds(since: startedAt)),
                "queryEdited": .bool(queryEdited),
                "queryLength": .int(trimmedQuery.count),
                "resultCount": .int(results.count)
            ]))
            return results
        } catch {
            trackEvent("manual_match_search_failed", properties: manualSearchProperties(item, extra: [
                "durationMs": .int(elapsedMilliseconds(since: startedAt)),
                "errorCategory": .string("apple_music_manual_search"),
                "errorMessage": .string(errorMessage(error)),
                "queryEdited": .bool(queryEdited),
                "queryLength": .int(trimmedQuery.count)
            ]))
            throw error
        }
    }

    func selectManualSearchCandidate(
        _ candidate: AppleSongCandidate,
        for item: TransferItem,
        resultRank: Int
    ) {
        selectedCandidatesByItemID[item.id] = candidate
        skippedItemIDs.remove(item.id)
        approvedItemIDs.insert(item.id)

        phase = createdPlaylist == nil ? .analysisReady : .created
        statusMessage = decisionConfirmation(for: item, candidateName: candidate.name)
        saveHistory(status: currentHistoryStatus)
        trackReviewDecision("manual-search", item: item)
        trackMatchFeedback(
            selectedCandidate: candidate,
            item: item,
            selectionSource: "manual_search",
            resultRank: resultRank
        )
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
        saveHistory(status: currentHistoryStatus)
        trackReviewDecision("skip", item: item)
    }

    func restoreTrack(_ item: TransferItem) {
        skippedItemIDs.remove(item.id)
        phase = createdPlaylist == nil ? .analysisReady : .created
        statusMessage = "Restored \"\(item.source.name)\" to the match report."
        saveHistory(status: currentHistoryStatus)
        trackReviewDecision("restore", item: item)
    }

    func reset() {
        playlistInput = ""
        currentSourceSurface = nil
        activeHistoryEntryID = nil
        preview = nil
        analysis = nil
        createdPlaylist = nil
        transferredItemIDs = []
        lastWriteOutcome = nil
        destinationPlaylistName = ""
        resetDecisions()
        stopActivity()
        phase = .idle
        statusMessage = "Paste a public Spotify playlist or song link to begin."
    }

    func openHistoryEntry(_ entry: TransferHistoryEntry) {
        stopActivity()
        activeHistoryEntryID = entry.id
        currentSourceSurface = "history_open"
        playlistInput = entry.input
        preview = entry.preview
        analysis = entry.analysis
        destinationPlaylistName = entry.destinationPlaylistName
        approvedItemIDs = entry.approvedItemIDs
        skippedItemIDs = entry.skippedItemIDs
        selectedCandidatesByItemID = entry.selectedCandidatesByItemID
        transferredItemIDs = entry.transferredItemIDs
        createdPlaylist = entry.createdPlaylist
        lastWriteOutcome = nil

        if entry.createdPlaylist != nil {
            phase = .created
            statusMessage = "Opened the completed transfer. Nothing will be added again unless you explicitly update it."
        } else if entry.analysis != nil {
            phase = .analysisReady
            statusMessage = entry.status == .failed
                ? "Opened the previous result. Review it and retry when ready."
                : "Opened the saved match report."
        } else {
            phase = .previewReady
            statusMessage = entry.status == .failed
                ? "Opened the failed attempt. Match it again when ready."
                : "Opened the saved Spotify preview."
        }

        trackHistoryEvent("history_opened", properties: historyProperties(entry))
    }

    func retryHistoryEntry(_ entry: TransferHistoryEntry) async {
        reset()
        activeHistoryEntryID = entry.id
        currentSourceSurface = "history_retry"
        playlistInput = entry.input
        trackHistoryEvent("history_retry_started", properties: historyProperties(entry))

        await previewPlaylist()
        guard phase == .previewReady else {
            trackHistoryEvent("history_retry_failed", properties: historyProperties(entry, extra: [
                "errorCategory": .string("history_preview_retry")
            ]))
            return
        }

        await analyzeMatches()
        guard phase == .analysisReady else {
            trackHistoryEvent("history_retry_failed", properties: historyProperties(entry, extra: [
                "errorCategory": .string("history_analysis_retry")
            ]))
            return
        }

        if let existingPlaylist = entry.createdPlaylist, let refreshedAnalysis = analysis {
            let previouslyTransferredSourceIDs = Set(
                (entry.analysis?.items ?? [])
                    .filter { entry.transferredItemIDs.contains($0.id) }
                    .map { $0.source.id }
            )
            transferredItemIDs = Set(
                refreshedAnalysis.items
                    .filter { previouslyTransferredSourceIDs.contains($0.source.id) }
                    .map(\.id)
            )
            createdPlaylist = existingPlaylist
            phase = .created
            statusMessage = pendingSyncItems.isEmpty
                ? "Matches refreshed. The existing Apple Music playlist is already up to date."
                : "\(pendingSyncItems.count) refreshed \(pendingSyncItems.count == 1 ? "match is" : "matches are") ready to add to the existing Apple Music playlist."
            saveHistory(status: .completed)
        }

        trackHistoryEvent("history_retry_succeeded", properties: historyProperties(entry))
    }

    func deleteHistoryEntry(_ entry: TransferHistoryEntry) {
        historyStore.remove(id: entry.id)
        historyEntries = historyStore.entries
        if activeHistoryEntryID == entry.id {
            activeHistoryEntryID = nil
        }
        trackHistoryEvent("history_deleted", properties: historyProperties(entry))
    }

    func clearHistory() {
        let count = historyEntries.count
        historyStore.removeAll()
        historyEntries = []
        activeHistoryEntryID = nil
        trackHistoryEvent("history_cleared", properties: [
            "historyCount": .int(count)
        ])
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

    func replaceSpotifyInput(with input: String, sourceSurface: String = "manual_input") {
        reset()
        currentSourceSurface = sourceSurface
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

    private func trackPreventedDuplicates(
        _ duplicateCount: Int,
        addedCount: Int,
        destination: String
    ) {
        guard duplicateCount > 0 else { return }

        trackEvent("duplicate_prevented", properties: summaryProperties(analysis, extra: [
            "duplicateCount": .int(duplicateCount),
            "addedCount": .int(addedCount),
            "duplicateDestination": .string(destination)
        ]))
    }

    private func trackHistoryEvent(
        _ event: String,
        properties: [String: AnalyticsPropertyValue] = [:]
    ) {
        var safeProperties: [String: AnalyticsPropertyValue] = [
            "host": .string("ios"),
            "path": .string("ios/history")
        ]
        properties.forEach { key, value in
            safeProperties[key] = value
        }
        let api = api

        Task {
            await api.recordUsageEvent(event, properties: safeProperties)
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

    private var currentHistoryStatus: TransferHistoryStatus {
        if createdPlaylist != nil { return .completed }
        if analysis != nil { return .ready }
        return .previewed
    }

    private func saveHistory(
        status: TransferHistoryStatus,
        errorMessage: String? = nil
    ) {
        guard let preview else { return }

        let now = Date()
        let normalizedInput = playlistInput.trimmingCharacters(in: .whitespacesAndNewlines)
        let existing = activeHistoryEntryID.flatMap { id in
            historyStore.entries.first { $0.id == id && $0.input == normalizedInput }
        }
        let entryID = existing?.id ?? UUID()
        activeHistoryEntryID = entryID

        let entry = TransferHistoryEntry(
            id: entryID,
            createdAt: existing?.createdAt ?? now,
            updatedAt: now,
            input: normalizedInput,
            preview: preview,
            analysis: analysis,
            destinationPlaylistName: destinationPlaylistName,
            approvedItemIDs: approvedItemIDs,
            skippedItemIDs: skippedItemIDs,
            selectedCandidatesByItemID: selectedCandidatesByItemID,
            transferredItemIDs: transferredItemIDs,
            createdPlaylist: createdPlaylist,
            status: status,
            errorMessage: errorMessage
        )

        historyStore.upsert(entry)
        historyEntries = historyStore.entries
    }

    private func historyProperties(
        _ entry: TransferHistoryEntry,
        extra: [String: AnalyticsPropertyValue] = [:]
    ) -> [String: AnalyticsPropertyValue] {
        var properties = extra
        properties["historyStatus"] = .string(entry.status.rawValue)
        properties["historyEntryAgeDays"] = .int(max(0, Calendar.current.dateComponents(
            [.day],
            from: entry.createdAt,
            to: Date()
        ).day ?? 0))
        properties["totalTracks"] = .int(entry.totalCount)
        properties["readyCount"] = .int(entry.readyCount)
        return properties
    }

    private func trackMatchFeedback(
        selectedCandidate: AppleSongCandidate,
        item: TransferItem,
        selectionSource: String,
        resultRank: Int?
    ) {
        var properties = manualSearchProperties(item)
        properties["selectedAppleCandidateId"] = .string(selectedCandidate.id)
        properties["selectionChanged"] = .bool(selectedCandidate.id != item.appleCandidate?.id)
        properties["selectionSource"] = .string(selectionSource)

        if let resultRank {
            properties["resultRank"] = .int(resultRank)
        }

        trackEvent("match_feedback_selected", properties: properties)
    }

    private func manualSearchProperties(
        _ item: TransferItem,
        extra: [String: AnalyticsPropertyValue] = [:]
    ) -> [String: AnalyticsPropertyValue] {
        var properties = summaryProperties(analysis, extra: extra)
        properties["itemIndex"] = .int(item.index)
        properties["sourceMatchStatus"] = .string(item.status)

        if let spotifyTrackID = item.source.spotifyTrackId {
            properties["spotifyTrackId"] = .string(spotifyTrackID)
        }
        if let spotifyISRC = item.source.isrc {
            properties["spotifyIsrc"] = .string(spotifyISRC)
        }
        if let algorithmCandidateID = item.appleCandidate?.id {
            properties["algorithmAppleCandidateId"] = .string(algorithmCandidateID)
        }
        if let confidence = item.confidence {
            properties["algorithmConfidence"] = .double(confidence)
        }
        if let reason = item.reason {
            properties["algorithmReason"] = .string(reason)
        }

        return properties
    }

    func manualSearchDefaultQuery(for item: TransferItem) -> String {
        "\(item.source.name) \(item.source.artistText)"
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private func analyticsContext(_ properties: [String: AnalyticsPropertyValue]) -> [String: AnalyticsPropertyValue] {
        var context: [String: AnalyticsPropertyValue] = [
            "host": .string("ios"),
            "path": .string("ios/import"),
            "analysisLimit": .int(AppConfig.defaultAnalysisLimit)
        ]

        if let currentSourceSurface {
            context["sourceSurface"] = .string(currentSourceSurface)
        }

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
