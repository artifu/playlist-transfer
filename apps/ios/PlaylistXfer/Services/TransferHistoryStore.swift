import Foundation

enum TransferHistoryStatus: String, Codable, Sendable {
    case previewed
    case ready
    case completed
    case failed
}

struct TransferHistoryEntry: Codable, Identifiable, Sendable {
    let id: UUID
    let createdAt: Date
    var updatedAt: Date
    let input: String
    var preview: PlaylistPreviewResponse
    var analysis: TransferAnalysis?
    var destinationPlaylistName: String
    var approvedItemIDs: Set<Int>
    var skippedItemIDs: Set<Int>
    var selectedCandidatesByItemID: [Int: AppleSongCandidate]
    var transferredItemIDs: Set<Int>
    var createdPlaylist: CreatedAppleMusicPlaylist?
    var status: TransferHistoryStatus
    var errorMessage: String?

    var displayName: String {
        analysis?.playlist.name ?? preview.playlist.name
    }

    var artworkURL: URL? {
        analysis?.playlist.imageUrl ?? preview.playlist.imageUrl
    }

    var readyCount: Int {
        guard let analysis else { return 0 }
        return analysis.items.filter { item in
            !skippedItemIDs.contains(item.id)
                && (item.status == "matched" || approvedItemIDs.contains(item.id))
        }.count
    }

    var totalCount: Int {
        analysis?.items.count ?? preview.playlist.totalItems ?? preview.tracks.count
    }
}

@MainActor
final class TransferHistoryStore {
    private static let maximumEntries = 30

    private let fileURL: URL
    private let encoder: JSONEncoder
    private let decoder: JSONDecoder

    private(set) var entries: [TransferHistoryEntry]

    init(fileURL: URL? = nil) {
        self.fileURL = fileURL ?? Self.defaultFileURL()

        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        self.encoder = encoder

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        self.decoder = decoder

        entries = []
        load()
    }

    func upsert(_ entry: TransferHistoryEntry) {
        entries.removeAll { $0.id == entry.id }
        entries.append(entry)
        entries.sort { $0.updatedAt > $1.updatedAt }
        entries = Array(entries.prefix(Self.maximumEntries))
        persist()
    }

    func remove(id: UUID) {
        entries.removeAll { $0.id == id }
        persist()
    }

    func removeAll() {
        entries = []
        persist()
    }

    private func load() {
        guard let data = try? Data(contentsOf: fileURL) else { return }

        do {
            entries = try decoder.decode([TransferHistoryEntry].self, from: data)
                .sorted { $0.updatedAt > $1.updatedAt }
        } catch {
            print("[PlaylistXfer] Could not read local transfer history: \(error.localizedDescription)")
        }
    }

    private func persist() {
        do {
            try FileManager.default.createDirectory(
                at: fileURL.deletingLastPathComponent(),
                withIntermediateDirectories: true
            )
            let data = try encoder.encode(entries)
            try data.write(to: fileURL, options: .atomic)
            try? FileManager.default.setAttributes(
                [.protectionKey: FileProtectionType.complete],
                ofItemAtPath: fileURL.path
            )
        } catch {
            print("[PlaylistXfer] Could not save local transfer history: \(error.localizedDescription)")
        }
    }

    private static func defaultFileURL() -> URL {
        let baseURL = FileManager.default.urls(
            for: .applicationSupportDirectory,
            in: .userDomainMask
        ).first ?? FileManager.default.temporaryDirectory

        return baseURL
            .appendingPathComponent("PlaylistXfer", isDirectory: true)
            .appendingPathComponent("transfer-history.json", isDirectory: false)
    }
}
