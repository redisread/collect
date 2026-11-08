import SwiftUI

struct AuthenticationView: View {
  @Environment(LibraryStore.self) private var store
  @State private var email = ""
  @State private var password = ""
  @State private var name = ""
  @State private var registering = false
  @State private var busy = false

  var body: some View {
    NavigationStack {
      Form {
        Section {
          Text("Collect").font(.largeTitle.bold())
          Text("留一点时间，认真阅读。").foregroundStyle(.secondary)
        }.listRowBackground(Color.black)
        Section {
          if registering { TextField("名字", text: $name).textContentType(.name) }
          TextField("邮箱", text: $email).textContentType(.emailAddress).keyboardType(.emailAddress)
            .textInputAutocapitalization(.never).autocorrectionDisabled()
          SecureField("密码", text: $password).textContentType(registering ? .newPassword : .password)
          Button(registering ? "创建账号" : "登录", action: submit)
            .disabled(busy || email.isEmpty || password.isEmpty || (registering && name.isEmpty))
          if busy { ProgressView("正在连接…") }
        }
        if let error = store.error {
          Text(error).foregroundStyle(.red).accessibilityLabel("错误，\(error)")
        }
        Button(registering ? "已有账号，登录" : "创建新账号") { registering.toggle() }
      }
      .scrollContentBackground(.hidden)
      .background(.black)
    }
  }
  private func submit() {
    busy = true
    Task {
      await store.authenticate(
        email: email.trimmingCharacters(in: .whitespaces), password: password,
        name: registering ? name : nil)
      busy = false
    }
  }
}
