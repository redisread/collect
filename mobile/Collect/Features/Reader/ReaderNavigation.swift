import Foundation
import Observation
import WebKit

@MainActor @Observable
final class ReaderNavigation: WebPage.NavigationDeciding {
    var externalURL: URL?
    func decidePolicy(for action: WebPage.NavigationAction, preferences: inout WebPage.NavigationPreferences) async -> WKNavigationActionPolicy {
        preferences.allowsContentJavaScript = false
        if action.navigationType == .linkActivated {
            if let url = action.request.url, ["https", "http"].contains(url.scheme) { externalURL = url }
            return .cancel
        }
        return .allow
    }
}
