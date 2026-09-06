import Foundation

enum AppConfig {
    static let transferAPIBaseURL = URL(string: "https://playlistxfer.com")!
    static let defaultAnalysisLimit = 500
    static let minimumSupportedIOS = "17.0"

    /// The transfer itself runs on-device by default. The hosted API remains a
    /// safety net while the public Spotify surfaces used by the local reader
    /// mature in production.
    static var localFirstTransfersEnabled: Bool {
        !ProcessInfo.processInfo.arguments.contains("-PlaylistXferRemoteOnly")
    }
}
