import SwiftUI
import UniformTypeIdentifiers

struct OPMLDocument: FileDocument {
  static var readableContentTypes: [UTType] { [.xml, .data] }
  var data: Data
  init(data: Data = Data()) { self.data = data }
  init(configuration: ReadConfiguration) throws {
    data = configuration.file.regularFileContents ?? Data()
  }
  func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper {
    FileWrapper(regularFileWithContents: data)
  }
}
