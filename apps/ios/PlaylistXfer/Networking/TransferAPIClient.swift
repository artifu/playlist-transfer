import Foundation

enum TransferAPIError: LocalizedError {
    case invalidURL(String)
    case server(String)
    case missingJobResult
    case timeout

    var errorDescription: String? {
        switch self {
        case .invalidURL(let path):
            return "Could not build API URL for \(path)."
        case .server(let message):
            return message
        case .missingJobResult:
            return "The analysis job finished without a result."
        case .timeout:
            return "The analysis job took too long. Try again with a smaller playlist."
        }
    }
}

struct TransferAPIClient: Sendable {
    private let baseURL: URL
    private let urlSession: URLSession
    private let decoder: JSONDecoder
    private let encoder: JSONEncoder

    init(baseURL: URL = AppConfig.transferAPIBaseURL, urlSession: URLSession = .shared) {
        self.baseURL = baseURL
        self.urlSession = urlSession
        self.decoder = JSONDecoder()
        self.encoder = JSONEncoder()
    }

    func previewPublicPlaylist(input: String) async throws -> PlaylistPreviewResponse {
        try await send(
            path: "/api/spotify/public-playlist-preview",
            method: "POST",
            body: PublicPlaylistRequest(input: input)
        )
    }

    func analyzePublicPlaylist(
        input: String,
        limit: Int = AppConfig.defaultAnalysisLimit,
        progress: (@MainActor (TransferJob<TransferAnalysis>) -> Void)? = nil
    ) async throws -> TransferAnalysis {
        let job: TransferJob<TransferAnalysis> = try await send(
            path: "/api/transfers/analyze-public-job",
            method: "POST",
            body: AnalyzePublicPlaylistRequest(input: input, limit: limit)
        )

        if let progress {
            await progress(job)
        }

        return try await pollAnalysisJob(job.id, progress: progress)
    }

    func recordUsageEvent(_ event: String, properties: [String: AnalyticsPropertyValue] = [:]) async {
        do {
            let _: UsageEventResponse = try await send(
                path: "/api/events",
                method: "POST",
                body: UsageEventRequest(event: event, properties: properties)
            )
        } catch {
            // Analytics should never interrupt the transfer flow.
        }
    }

    private func pollAnalysisJob(
        _ jobID: String,
        progress: (@MainActor (TransferJob<TransferAnalysis>) -> Void)? = nil
    ) async throws -> TransferAnalysis {
        for _ in 0..<900 {
            try await Task.sleep(for: .milliseconds(650))

            let job: TransferJob<TransferAnalysis> = try await send(
                path: "/api/jobs/\(jobID)",
                method: "GET",
                body: EmptyRequest?.none
            )

            if let progress {
                await progress(job)
            }

            if job.isFailed {
                throw TransferAPIError.server(job.error ?? "Analysis failed.")
            }

            if job.isComplete {
                guard let result = job.result else { throw TransferAPIError.missingJobResult }
                return result
            }
        }

        throw TransferAPIError.timeout
    }

    private func send<Response: Decodable, Body: Encodable>(
        path: String,
        method: String,
        body: Body?
    ) async throws -> Response {
        guard let url = URL(string: path, relativeTo: baseURL) else {
            throw TransferAPIError.invalidURL(path)
        }

        var request = URLRequest(url: url)
        request.httpMethod = method
        request.cachePolicy = .reloadIgnoringLocalCacheData
        request.setValue(SessionStore.anonymousSessionID, forHTTPHeaderField: "X-PlaylistTransfer-Session")

        if let body {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try encoder.encode(body)
        }

        let (data, response) = try await urlSession.data(for: request)
        let statusCode = (response as? HTTPURLResponse)?.statusCode ?? 0

        guard (200..<300).contains(statusCode) else {
            let apiError = try? decoder.decode(APIErrorResponse.self, from: data)
            throw TransferAPIError.server(apiError?.message ?? "Request failed with status \(statusCode).")
        }

        return try decoder.decode(Response.self, from: data)
    }
}

private struct PublicPlaylistRequest: Encodable {
    let input: String
}

private struct AnalyzePublicPlaylistRequest: Encodable {
    let input: String
    let limit: Int
}

enum AnalyticsPropertyValue: Encodable, Sendable {
    case string(String)
    case int(Int)
    case double(Double)
    case bool(Bool)

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()

        switch self {
        case .string(let value):
            try container.encode(value)
        case .int(let value):
            try container.encode(value)
        case .double(let value):
            try container.encode(value)
        case .bool(let value):
            try container.encode(value)
        }
    }
}

private struct UsageEventRequest: Encodable {
    let event: String
    let properties: [String: AnalyticsPropertyValue]
}

private struct UsageEventResponse: Decodable {
    let ok: Bool?
}

private struct EmptyRequest: Encodable {}

enum SessionStore {
    private static let key = "playlistxfer.anonymous-session-id"

    static var anonymousSessionID: String {
        if let stored = UserDefaults.standard.string(forKey: key), !stored.isEmpty {
            return stored
        }

        let sessionID = "ios-\(UUID().uuidString)"
        UserDefaults.standard.set(sessionID, forKey: key)
        return sessionID
    }
}
