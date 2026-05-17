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

        do {
            preview = try await api.previewPublicPlaylist(input: input)
            phase = .previewReady
            statusMessage = "Playlist loaded. Match it with Apple Music when you are ready."
        } catch {
            fail(error)
        }
    }

    func openIncomingURL(_ url: URL) async {
        guard let playlistURL = playlistInput(fromIncomingURL: url) else {
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

        do {
            analysis = try await api.analyzePublicPlaylist(input: input)
            phase = .analysisReady
            statusMessage = "Apple Music match report ready. Create from ready tracks when you are comfortable."
        } catch {
            fail(error)
        }
    }

    func createAppleMusicPlaylist() async {
        guard let analysis, canCreate else { return }

        phase = .creating
        statusMessage = "Asking Apple Music for access and preparing the ready tracks..."

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
        } catch {
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
    }

    func restoreTrack(_ item: TransferItem) {
        skippedItemIDs.remove(item.id)
        createdPlaylist = nil
        phase = .analysisReady
        statusMessage = "Restored \"\(item.source.name)\" to the match report."
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

    private func fail(_ error: Error) {
        let message = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
        phase = .failed(message)
        statusMessage = message
    }
}
