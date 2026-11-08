import SwiftData
import SwiftUI
import WebKit

struct TranslationResponse: Decodable, Sendable {
  let translatedHtml: String
  let bilingualHtml: String
}
