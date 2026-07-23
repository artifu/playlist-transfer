import MetricKit
import SwiftUI

@main
struct PlaylistXferApp: App {
    @Environment(\.scenePhase) private var scenePhase
    @StateObject private var viewModel = TransferViewModel()
    @StateObject private var diagnosticsReporter = AppDiagnosticsReporter()

    var body: some Scene {
        WindowGroup {
            ImportView(viewModel: viewModel)
                .task {
                    viewModel.recordAppBecameActive()
                }
                .onChange(of: scenePhase) { _, newPhase in
                    if newPhase == .active {
                        viewModel.recordAppBecameActive()
                    }
                }
                .onOpenURL { url in
                    Task {
                        await viewModel.openIncomingURL(url)
                    }
                }
        }
    }
}

final class AppDiagnosticsReporter: NSObject, ObservableObject, MXMetricManagerSubscriber {
    private let api: TransferAPIClient

    init(api: TransferAPIClient = TransferAPIClient()) {
        self.api = api
        super.init()
        MXMetricManager.shared.add(self)
    }

    deinit {
        MXMetricManager.shared.remove(self)
    }

    func didReceive(_ payloads: [MXDiagnosticPayload]) {
        let properties: [String: AnalyticsPropertyValue] = [
            "host": .string("ios"),
            "path": .string("ios/diagnostics"),
            "diagnosticPayloadCount": .int(payloads.count),
            "crashCount": .int(payloads.reduce(0) { $0 + ($1.crashDiagnostics?.count ?? 0) }),
            "hangCount": .int(payloads.reduce(0) { $0 + ($1.hangDiagnostics?.count ?? 0) }),
            "cpuExceptionCount": .int(payloads.reduce(0) { $0 + ($1.cpuExceptionDiagnostics?.count ?? 0) }),
            "diskWriteExceptionCount": .int(payloads.reduce(0) { $0 + ($1.diskWriteExceptionDiagnostics?.count ?? 0) })
        ]

        let api = api
        Task {
            await api.recordUsageEvent("app_diagnostics_received", properties: properties)
        }
    }
}
