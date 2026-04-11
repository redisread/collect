import { Resend } from "resend";
import type { User, Article } from "../../db/schema";

interface ArticleWithFeed extends Article {
  feedTitle?: string;
}

/**
 * 发送摘要邮件
 */
export async function sendDigestEmail(
  user: User,
  articles: ArticleWithFeed[],
  resendApiKey: string,
  frontendUrl: string
): Promise<{ success: boolean; error?: string }> {
  if (!resendApiKey) {
    return { success: false, error: "Resend API key not configured" };
  }

  if (articles.length === 0) {
    return { success: true };
  }

  const resend = new Resend(resendApiKey);

  const html = generateDigestEmailHtml(user, articles, frontendUrl);
  const subject = generateEmailSubject(articles);

  try {
    const { error } = await resend.emails.send({
      from: "Collect <digest@collect.app>",
      to: user.email,
      subject,
      html,
      text: generatePlainTextEmail(user, articles, frontendUrl),
    });

    if (error) {
      console.error("Failed to send email:", error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error("Error sending email:", errorMessage);
    return { success: false, error: errorMessage };
  }
}

/**
 * 生成邮件主题
 */
function generateEmailSubject(articles: ArticleWithFeed[]): string {
  const count = articles.length;
  const firstTitle = articles[0]?.title || "";

  if (count === 1) {
    return `📰 ${firstTitle}`;
  }

  return `📰 您有 ${count} 篇未读文章 - Collect 阅读摘要`;
}

/**
 * 生成 HTML 邮件内容
 */
function generateDigestEmailHtml(
  user: User,
  articles: ArticleWithFeed[],
  frontendUrl: string
): string {
  const today = new Date().toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  });

  const articlesHtml = articles
    .map((article) => {
      const summary =
        article.summary?.slice(0, 200) ||
        article.content?.slice(0, 200).replace(/<[^>]*>/g, "") ||
        "暂无摘要";
      const meta = [
        article.feedTitle,
        article.author,
        article.publishedAt
          ? new Date(article.publishedAt).toLocaleDateString("zh-CN")
          : null,
      ]
        .filter(Boolean)
        .join(" · ");

      return `
      <div class="article" style="margin-bottom: 32px; padding-bottom: 32px; border-bottom: 1px solid #f0f0f0;">
        <h2 style="margin: 0 0 8px 0; font-size: 20px; line-height: 1.4;">
          <a href="${article.url}" style="color: #1a1a1a; text-decoration: none;">${escapeHtml(article.title)}</a>
        </h2>
        <p class="meta" style="margin: 0 0 12px 0; color: #666; font-size: 13px;">${escapeHtml(meta)}</p>
        <p class="summary" style="margin: 0; color: #444; font-size: 15px; line-height: 1.6;">${escapeHtml(summary)}${summary.length >= 200 ? "..." : ""}</p>
        <a href="${frontendUrl}/article/${article.id}" style="display: inline-block; margin-top: 12px; color: #007AFF; text-decoration: none; font-size: 14px; font-weight: 500;">在 Collect 中阅读 →</a>
      </div>
    `;
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>您的阅读摘要 - Collect</title>
  <style>
    @media only screen and (max-width: 600px) {
      .container { padding: 20px !important; }
      .header h1 { font-size: 22px !important; }
      .article h2 { font-size: 18px !important; }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5; color: #1a1a1a;">
  <div class="container" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; padding: 40px;">
    <!-- Header -->
    <div class="header" style="text-align: center; margin-bottom: 40px; padding-bottom: 30px; border-bottom: 2px solid #f0f0f0;">
      <div class="logo" style="margin-bottom: 16px;">
        <span style="font-size: 32px;">📚</span>
      </div>
      <h1 style="margin: 0 0 8px 0; font-size: 26px; font-weight: 600;">您的阅读摘要</h1>
      <p class="date" style="margin: 0; color: #666; font-size: 15px;">${today}</p>
    </div>

    <!-- Greeting -->
    <div class="greeting" style="margin-bottom: 32px; padding: 20px; background-color: #f8f9fa; border-radius: 8px;">
      <p style="margin: 0; font-size: 15px; line-height: 1.6;">👋 ${escapeHtml(user.name || "你好")}，这是为您整理的未读文章，祝您阅读愉快！</p>
    </div>

    <!-- Articles -->
    <div class="articles">
      ${articlesHtml}
    </div>

    <!-- CTA -->
    <div class="cta" style="text-align: center; margin: 40px 0; padding: 24px; background-color: #007AFF; border-radius: 8px;">
      <a href="${frontendUrl}" style="color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 500;">打开 Collect 阅读更多</a>
    </div>

    <!-- Footer -->
    <div class="footer" style="text-align: center; padding-top: 30px; border-top: 1px solid #f0f0f0; color: #888; font-size: 13px;">
      <p style="margin: 0 0 12px 0;">
        <a href="${frontendUrl}/settings" style="color: #666; text-decoration: underline;">邮件偏好设置</a> · 
        <a href="${frontendUrl}/settings" style="color: #666; text-decoration: underline;">取消订阅</a>
      </p>
      <p style="margin: 0 0 4px 0;">Collect - 您的现代 RSS 阅读器</p>
      <p style="margin: 0; font-size: 12px; color: #aaa;">此邮件由系统自动发送，请勿直接回复</p>
    </div>
  </div>
</body>
</html>`;
}

/**
 * 生成纯文本邮件内容（备用）
 */
function generatePlainTextEmail(
  user: User,
  articles: ArticleWithFeed[],
  frontendUrl: string
): string {
  const today = new Date().toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  });

  const articlesText = articles
    .map((article, index) => {
      const meta = [
        article.feedTitle,
        article.author,
        article.publishedAt
          ? new Date(article.publishedAt).toLocaleDateString("zh-CN")
          : null,
      ]
        .filter(Boolean)
        .join(" · ");

      return `
${index + 1}. ${article.title}
   ${meta}
   ${article.url}
   在 Collect 阅读: ${frontendUrl}/article/${article.id}
`;
    })
    .join("\n");

  return `您的阅读摘要 - ${today}

👋 ${user.name || "你好"}，这是为您整理的未读文章：

${articlesText}

打开 Collect 阅读更多: ${frontendUrl}

---
邮件偏好设置: ${frontendUrl}/settings
Collect - 您的现代 RSS 阅读器
`;
}

/**
 * HTML 转义
 */
function escapeHtml(text: string): string {
  const div = { toString: () => "" };
  const map: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };
  return text?.replace(/[&<>"']/g, (m) => map[m] || m) || "";
}

/**
 * 模拟发送邮件（用于测试）
 */
export async function mockSendDigestEmail(
  user: User,
  articles: ArticleWithFeed[],
  frontendUrl: string
): Promise<{ success: boolean; html?: string; error?: string }> {
  const html = generateDigestEmailHtml(user, articles, frontendUrl);

  console.log("\n========== 模拟邮件发送 ==========");
  console.log(`收件人: ${user.email}`);
  console.log(`主题: ${generateEmailSubject(articles)}`);
  console.log(`文章数量: ${articles.length}`);
  console.log("================================\n");

  return { success: true, html };
}
