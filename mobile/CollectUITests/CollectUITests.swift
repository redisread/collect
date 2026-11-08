import XCTest

final class CollectUITests: XCTestCase {
  @MainActor func testReaderActionsLight() {
    verifyReaderActions(appearance: "light")
  }

  @MainActor func testReaderActionsDark() {
    verifyReaderActions(appearance: "dark")
  }

  @MainActor func testReaderActionsLargeText() {
    let app = XCUIApplication()
    app.launchArguments = [
      "--ui-testing", "-appearance", "light",
      "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL",
    ]
    app.launch()
    XCTAssertTrue(app.buttons["未读, 1"].waitForExistence(timeout: 10))
    app.buttons["未读, 1"].tap()
    let article = app.staticTexts["给阅读留一点时间"]
    XCTAssertTrue(article.waitForExistence(timeout: 10))
    article.tap()
    XCTAssertTrue(app.buttons["阅读操作"].waitForExistence(timeout: 10))
    app.buttons["阅读操作"].tap()
    XCTAssertTrue(app.buttons["在浏览器中打开"].waitForExistence(timeout: 5))
    XCTAssertTrue(app.buttons["在浏览器中打开"].isHittable)
    let initial = XCTAttachment(screenshot: app.screenshot())
    initial.name = "Reader actions large text opened"
    initial.lifetime = .keepAlways
    add(initial)
    let menu = app.scrollViews["reader-actions-scroll"]
    menu.swipeUp()
    let original = app.buttons["reader-mode-0"]
    if !original.isHittable { menu.swipeUp() }
    XCTAssertTrue(original.isHittable)
    XCTAssertTrue(original.isSelected)
    XCTAssertFalse(app.buttons["reader-mode-1"].isEnabled)
    let capture = XCTAttachment(screenshot: app.screenshot())
    capture.name = "Reader actions accessibility text"
    capture.lifetime = .keepAlways
    add(capture)
  }

  @MainActor private func verifyReaderActions(appearance: String) {
    let app = XCUIApplication()
    app.launchArguments = ["--ui-testing", "-appearance", appearance]
    app.launch()
    XCTAssertTrue(app.buttons["unclassified-folder"].waitForExistence(timeout: 10))
    app.buttons["unclassified-folder"].tap()
    let article = app.staticTexts["给阅读留一点时间"]
    XCTAssertTrue(article.waitForExistence(timeout: 10))
    article.tap()
    XCTAssertTrue(app.webViews.staticTexts["这是一篇本地测试文章。"].waitForExistence(timeout: 10))
    app.buttons["阅读操作"].tap()
    XCTAssertTrue(app.buttons["在浏览器中打开"].waitForExistence(timeout: 5))
    XCTAssertTrue(app.buttons["分享"].isHittable)
    XCTAssertTrue(app.buttons["标记未读"].isHittable)
    XCTAssertFalse(app.buttons["reader-mode-1"].isEnabled)
    XCTAssertFalse(app.buttons["reader-mode-2"].isEnabled)
    let capture = XCTAttachment(screenshot: app.screenshot())
    capture.name = "Reader actions \(appearance)"
    capture.lifetime = .keepAlways
    add(capture)
    app.buttons["翻译为简体中文"].tap()
    XCTAssertTrue(app.staticTexts["reader-operation-message"].waitForExistence(timeout: 5))
    XCTAssertTrue(app.buttons["reader-mode-1"].isEnabled)
    XCTAssertTrue(app.buttons["reader-mode-1"].isSelected)
    app.buttons["reader-mode-2"].tap()
    XCTAssertTrue(app.buttons["reader-mode-2"].isSelected)
    app.buttons["reader-mode-0"].tap()
    XCTAssertTrue(app.buttons["reader-mode-0"].isSelected)
    app.buttons["提取全文"].tap()
    let reset = XCTNSPredicateExpectation(
      predicate: NSPredicate(format: "enabled == false"), object: app.buttons["reader-mode-1"])
    XCTAssertEqual(XCTWaiter.wait(for: [reset], timeout: 5), .completed)
    XCTAssertTrue(app.buttons["reader-mode-0"].isSelected)
    app.buttons["标记未读"].tap()
    XCTAssertTrue(app.buttons["阅读操作"].waitForExistence(timeout: 5))
    app.buttons["阅读操作"].tap()
    XCTAssertTrue(app.buttons["标记已读"].waitForExistence(timeout: 5))
  }

  @MainActor func testManagementSearchMoveAndUnsubscribe() {
    let app = XCUIApplication()
    app.launchArguments = ["--ui-testing"]
    app.launch()
    XCTAssertTrue(app.buttons["manage-subscriptions"].waitForExistence(timeout: 10))
    app.buttons["manage-subscriptions"].tap()
    let search = app.searchFields.firstMatch
    XCTAssertTrue(search.waitForExistence(timeout: 5))
    let capture = XCTAttachment(screenshot: app.screenshot())
    capture.name = "Subscription management"
    capture.lifetime = .keepAlways
    add(capture)
    search.tap()
    search.typeText("阅读笔记\n")
    XCTAssertTrue(app.staticTexts["阅读笔记"].exists)
    XCTAssertFalse(app.staticTexts["目录订阅"].exists)
    app.buttons["选择"].tap()
    app.staticTexts["阅读笔记"].tap()
    app.buttons["移动"].tap()
    app.buttons["测试目录"].tap()
    XCTAssertTrue(app.staticTexts["已完成 1 / 1 项"].waitForExistence(timeout: 5))
    XCTAssertTrue(app.staticTexts["测试目录"].exists)
    app.buttons["选择"].tap()
    app.staticTexts["阅读笔记"].tap()
    app.buttons["取消订阅"].tap()
    XCTAssertTrue(app.staticTexts["取消 1 个订阅并清理普通文章？收藏和稍后阅读会保留。"].waitForExistence(timeout: 5))
    app.buttons["确认取消订阅"].tap()
    XCTAssertTrue(app.staticTexts["没有匹配的订阅源"].waitForExistence(timeout: 5))
  }

  @MainActor func testAddSubscriptionIntoFolder() {
    let app = XCUIApplication()
    app.launchArguments = ["--ui-testing"]
    app.launch()
    XCTAssertTrue(app.buttons["manage-subscriptions"].waitForExistence(timeout: 10))
    app.buttons["manage-subscriptions"].tap()
    app.buttons["open-add-subscription"].tap()
    app.textFields["https://"].tap()
    app.textFields["https://"].typeText("https://example.com/new.xml")
    app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "添加到文件夹")).firstMatch.tap()
    app.buttons["测试目录"].tap()
    app.buttons["submit-subscription"].tap()
    XCTAssertTrue(app.staticTexts["新订阅"].waitForExistence(timeout: 5))
    app.staticTexts["新订阅"].tap()
    XCTAssertTrue(app.textFields["订阅名称"].waitForExistence(timeout: 5))
    XCTAssertEqual(app.textFields["订阅名称"].value as? String, "新订阅")
    XCTAssertTrue(
      app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "测试目录")).firstMatch.exists)
  }

  @MainActor func testCreateRenameAndReorderFolders() {
    let app = XCUIApplication()
    app.launchArguments = ["--ui-testing"]
    app.launch()
    XCTAssertTrue(app.buttons["manage-subscriptions"].waitForExistence(timeout: 10))
    app.buttons["manage-subscriptions"].tap()
    app.buttons["管理文件夹"].tap()
    app.buttons["新建文件夹"].tap()
    app.alerts.textFields["文件夹名称"].typeText("稍后整理")
    app.alerts.buttons["创建"].tap()
    XCTAssertTrue(app.staticTexts["稍后整理"].waitForExistence(timeout: 5))
    app.staticTexts["稍后整理"].tap()
    let name = app.textFields["名称"]
    XCTAssertTrue(name.waitForExistence(timeout: 5))
    name.coordinate(withNormalizedOffset: CGVector(dx: 0.95, dy: 0.5)).tap()
    name.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: 4) + "归档")
    app.buttons["保存"].tap()
    XCTAssertTrue(app.staticTexts["归档"].waitForExistence(timeout: 5))
    app.buttons["排序"].tap()
    let moved = app.cells.containing(.staticText, identifier: "归档").firstMatch
    let other = app.cells.containing(.staticText, identifier: "测试目录").firstMatch
    moved.coordinate(withNormalizedOffset: CGVector(dx: 0.95, dy: 0.5)).press(
      forDuration: 0.8,
      thenDragTo: other.coordinate(withNormalizedOffset: CGVector(dx: 0.95, dy: 0.1)))
    XCTAssertLessThan(moved.frame.minY, other.frame.minY)
  }

  @MainActor func testSettingsToolbarEntry() {
    let app = XCUIApplication()
    app.launchArguments = ["--ui-testing"]
    app.launch()
    let settings = app.buttons["settings-button"]
    XCTAssertTrue(settings.waitForExistence(timeout: 10))
    XCTAssertLessThan(settings.frame.midX, app.frame.midX)
    XCTAssertFalse(app.staticTexts["设置"].exists)
    let screenshot = XCTAttachment(screenshot: app.screenshot())
    screenshot.name = "Settings toolbar"
    screenshot.lifetime = .keepAlways
    add(screenshot)
    XCTAssertFalse(app.buttons["离线阅读"].exists)
    settings.tap()
    XCTAssertTrue(app.navigationBars["设置"].waitForExistence(timeout: 5))
    XCTAssertTrue(app.buttons["个人资料"].exists)
    XCTAssertFalse(app.buttons["离线缓存"].exists)
    XCTAssertTrue(app.buttons["文章保存期限"].exists)
  }

  @MainActor func testFolderNavigationAndExpansion() {
    let app = XCUIApplication()
    app.launchArguments = ["--ui-testing"]
    app.launch()
    let folder = app.buttons["folder-test-folder"]
    XCTAssertTrue(folder.waitForExistence(timeout: 10))
    folder.tap()
    XCTAssertTrue(app.staticTexts["目录中的文章"].waitForExistence(timeout: 5))
    XCTAssertFalse(app.staticTexts["给阅读留一点时间"].exists)
    app.navigationBars.buttons.firstMatch.tap()
    let expand = app.buttons["folder-test-folder-expand"]
    expand.tap()
    XCTAssertTrue(app.navigationBars["Collect"].exists)
    XCTAssertTrue(app.staticTexts["目录订阅"].exists)
    XCTAssertFalse(app.staticTexts["查看文件夹文章"].exists)
    let screenshot = XCTAttachment(screenshot: app.screenshot())
    screenshot.name = "Folder direct navigation"
    screenshot.lifetime = .keepAlways
    add(screenshot)
    expand.tap()
    XCTAssertFalse(app.staticTexts["目录订阅"].exists)
    expand.tap()
    app.staticTexts["目录订阅"].tap()
    XCTAssertTrue(app.staticTexts["目录中的文章"].waitForExistence(timeout: 5))
    app.navigationBars.buttons.firstMatch.tap()
    folder.press(forDuration: 1)
    XCTAssertTrue(app.buttons["管理文件夹"].waitForExistence(timeout: 5))
    app.buttons["管理文件夹"].tap()
    XCTAssertTrue(app.navigationBars["测试目录"].waitForExistence(timeout: 5))
  }

  @MainActor func testLightAppearanceAndBulkRead() {
    let app = XCUIApplication()
    app.launchArguments = ["--ui-testing", "-appearance", "light"]
    app.launch()
    XCTAssertTrue(app.navigationBars["Collect"].waitForExistence(timeout: 10))
    app.buttons["unclassified-folder-expand"].tap()
    app.staticTexts["阅读笔记"].tap()
    app.buttons["全部标为已读"].tap()
    app.navigationBars.buttons.firstMatch.tap()
    XCTAssertTrue(app.buttons["未读, 0"].waitForExistence(timeout: 5))
    app.staticTexts["阅读笔记"].tap()
    app.staticTexts["给阅读留一点时间"].tap()
    XCTAssertTrue(app.webViews.staticTexts["这是一篇本地测试文章。"].waitForExistence(timeout: 10))
    let visible = XCTNSPredicateExpectation(
      predicate: NSPredicate(format: "hittable == true"),
      object: app.webViews.staticTexts["这是一篇本地测试文章。"])
    XCTAssertEqual(XCTWaiter.wait(for: [visible], timeout: 10), .completed)
    let screenshot = XCTAttachment(screenshot: app.screenshot())
    screenshot.name = "Light reader"
    screenshot.lifetime = .keepAlways
    add(screenshot)
  }

  @MainActor func testSubscriptionManagementEntry() {
    let app = XCUIApplication()
    app.launchArguments = ["--ui-testing"]
    app.launch()
    XCTAssertTrue(app.navigationBars["Collect"].waitForExistence(timeout: 10))
    app.buttons["unclassified-folder-expand"].tap()
    app.staticTexts["阅读笔记"].press(forDuration: 1)
    app.buttons["管理订阅"].tap()
    XCTAssertTrue(app.buttons["保存"].waitForExistence(timeout: 5))
    app.buttons["取消订阅"].tap()
    XCTAssertTrue(app.staticTexts["取消订阅并清理普通文章？收藏和稍后阅读会保留。"].waitForExistence(timeout: 5))
    app.buttons["确认取消订阅"].tap()
    XCTAssertTrue(app.navigationBars["Collect"].waitForExistence(timeout: 5))
    XCTAssertFalse(app.staticTexts["阅读笔记"].exists)
  }

  @MainActor func testRestoresReadingProgress() {
    let app = XCUIApplication()
    app.launchArguments = ["--ui-testing", "--resume-reading"]
    app.launch()
    XCTAssertTrue(app.navigationBars["Collect"].waitForExistence(timeout: 10))
    app.buttons["unclassified-folder"].tap()
    XCTAssertTrue(app.staticTexts["给阅读留一点时间"].waitForExistence(timeout: 10))
    XCTAssertFalse(app.staticTexts["目录中的文章"].exists)
    app.staticTexts["给阅读留一点时间"].tap()
    let end = app.webViews.staticTexts["阅读终点"]
    XCTAssertTrue(end.waitForExistence(timeout: 10))
    let visible = XCTNSPredicateExpectation(
      predicate: NSPredicate(format: "hittable == true"), object: end)
    XCTAssertEqual(XCTWaiter.wait(for: [visible], timeout: 10), .completed)
  }

  @MainActor func testReaderAndUnclassifiedNavigation() {
    let app = XCUIApplication()
    app.launchArguments = ["--ui-testing"]
    app.launch()
    XCTAssertTrue(app.navigationBars["Collect"].waitForExistence(timeout: 10))
    app.buttons["unclassified-folder"].tap()
    XCTAssertFalse(app.staticTexts["目录中的文章"].exists)
    let article = app.staticTexts["给阅读留一点时间"]
    XCTAssertTrue(article.waitForExistence(timeout: 10))
    article.tap()
    XCTAssertTrue(app.webViews.firstMatch.waitForExistence(timeout: 10))
    XCTAssertTrue(app.buttons["阅读操作"].exists)
    XCTAssertTrue(app.webViews.staticTexts["这是一篇本地测试文章。"].waitForExistence(timeout: 10))
    XCTAssertTrue(app.webViews.staticTexts["这是一篇本地测试文章。"].isHittable)
    let capture = XCTAttachment(screenshot: app.screenshot())
    capture.name = "Collect Reader"
    capture.lifetime = .keepAlways
    add(capture)
  }
}
