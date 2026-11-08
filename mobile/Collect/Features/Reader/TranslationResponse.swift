import SwiftUI
import SwiftData
import WebKit

struct TranslationResponse: Decodable, Sendable {
    let translatedHtml: String
    let bilingualHtml: String
}
