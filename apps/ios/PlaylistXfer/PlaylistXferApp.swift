import SwiftUI

@main
struct PlaylistXferApp: App {
    @StateObject private var viewModel = TransferViewModel()

    var body: some Scene {
        WindowGroup {
            ImportView(viewModel: viewModel)
                .onOpenURL { url in
                    Task {
                        await viewModel.openIncomingURL(url)
                    }
                }
        }
    }
}
