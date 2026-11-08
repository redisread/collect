import XCTest

final class CollectUITests: XCTestCase {
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
    settings.tap()
    XCTAssertTrue(app.navigationBars["设置"].waitForExistence(timeout: 5))
    XCTAssertTrue(app.buttons["个人资料"].exists)
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
    XCTAssertTrue(app.buttons["保存位置"].waitForExistence(timeout: 5))
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
