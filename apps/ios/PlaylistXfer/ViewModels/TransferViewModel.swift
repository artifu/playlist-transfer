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
        analysis?.items.filter { $0.status == "matched" } ?? []
    }

    var reviewItems: [TransferItem] {
        analysis?.items.filter { $0.status == "needs_review" } ?? []
    }

    var missingItems: [TransferItem] {
        analysis?.items.filter { $0.status == "unmatched" } ?? []
    }

    func previewPlaylist() async {
        let input = playlistInput.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !input.isEmpty else { return }

        phase = .previewing
        statusMessage = "Reading public Spotify playlist..."
        analysis = nil
        createdPlaylist = nil

        do {
            preview = try await api.previewPublicPlaylist(input: input)
            phase = .previewReady
            statusMessage = "Playlist loaded. Analyze matches when you are ready."
        } catch {
            fail(error)
        }
    }

    func analyzeMatches() async {
        let input = playlistInput.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !input.isEmpty else { return }

        phase = .analyzing
        statusMessage = "Matching this playlist against Apple Music..."
        createdPlaylist = nil

        do {
            analysis = try await api.analyzePublicPlaylist(input: input)
            phase = .analysisReady
            statusMessage = "Match report ready. Create from ready tracks when you are comfortable."
        } catch {
            fail(error)
        }
    }

    func createAppleMusicPlaylist() async {
        guard let analysis, canCreate else { return }

        phase = .creating
        statusMessage = "Asking Apple Music for access and preparing the ready tracks..."

        do {
            let playlist = try await appleMusic.createPlaylist(from: analysis)
            createdPlaylist = playlist
            phase = .created
            statusMessage = "Created \(playlist.name) with \(playlist.trackCount) ready tracks."
        } catch {
            fail(error)
        }
    }

    func reset() {
        preview = nil
        analysis = nil
        createdPlaylist = nil
        phase = .idle
        statusMessage = "Paste a public Spotify playlist link to begin."
    }

    private func fail(_ error: Error) {
        let message = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
        phase = .failed(message)
        statusMessage = message
    }
}
