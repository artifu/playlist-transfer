import Foundation

struct PlaylistPreviewResponse: Decodable, Sendable {
    let playlist: SpotifyPlaylist
    let tracks: [SpotifyTrack]
}

struct SpotifyPlaylist: Decodable, Identifiable, Sendable {
    let id: String
    let name: String
    let kind: String?
    let description: String?
    let imageUrl: URL?
    let totalItems: Int?
    let source: String?
    let limitations: [String]?
}

struct SpotifyTrack: Decodable, Identifiable, Sendable {
    let spotifyTrackId: String?
    let isrc: String?
    let name: String
    let artists: [String]
    let album: String?
    let albumImageUrl: URL?
    let durationMs: Int?

    var id: String {
        spotifyTrackId ?? "\(name)-\(artists.joined(separator: ","))-\(album ?? "")"
    }

    var artistText: String {
        artists.joined(separator: ", ")
    }
}

struct TransferJob<Result: Decodable & Sendable>: Decodable, Sendable {
    let id: String
    let kind: String
    let status: String
    let phase: String
    let progress: Int
    let completed: Int
    let total: Int
    let result: Result?
    let error: String?

    var isComplete: Bool {
        status == "complete"
    }

    var isFailed: Bool {
        status == "error"
    }
}

struct TransferAnalysis: Decodable, Sendable {
    let playlist: AnalyzedPlaylist
    let summary: TransferSummary
    let items: [TransferItem]
    let transferId: String?
    let transfer: TransferRecord?
    let createdApplePlaylistId: String?
}

struct TransferRecord: Decodable, Sendable {
    let id: String
    let status: String
    let input: String
    let analysisLimit: Int
    let createdAt: String
    let updatedAt: String
    let createdApplePlaylistId: String?
}

struct AnalyzedPlaylist: Decodable, Identifiable, Sendable {
    let id: String
    let name: String
    let kind: String?
    let imageUrl: URL?
    let totalItems: Int?
    let originalTotalItems: Int?
    let analyzedTrackCount: Int?
    let partialAnalysis: Bool?
    let source: String?
    let limitations: [String]?
}

struct TransferSummary: Decodable, Sendable {
    let matchedCount: Int
    let unmatchedCount: Int
    let needsReviewCount: Int
    let confidentMatchCount: Int
    let matchRate: Double
}

struct TransferItem: Decodable, Identifiable, Sendable {
    let index: Int
    let status: String
    let source: SpotifyTrack
    let confidence: Double?
    let reason: String?
    let appleCandidate: AppleSongCandidate?
    let candidateCount: Int?
    let candidates: [AppleSongCandidate]?

    var id: Int {
        index
    }

    var statusLabel: String {
        switch status {
        case "matched":
            return "Ready"
        case "needs_review":
            return "Review"
        default:
            return "Missing"
        }
    }

    var confidencePercent: String {
        guard let confidence else { return "" }
        return "\(Int((confidence * 100).rounded()))%"
    }
}

struct AppleSongCandidate: Decodable, Sendable {
    let id: String
    let name: String
    let artistName: String
    let albumName: String?
    let durationMs: Int?
    let isrc: String?
    let url: URL?
    let artworkUrl: URL?
}

struct APIErrorResponse: Decodable {
    let error: Bool?
    let message: String?
}
