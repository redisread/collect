import { authClient, signOut } from "@/lib/auth-client";
import { navigateWithinReader } from "@/lib/navigation";

export function UserMenu() {
	const { data: session } = authClient.useSession();

	const handleSignOut = async () => {
		await signOut();
		window.location.href = "/login";
	};

	return (
		<div className="flex items-center gap-2 px-3 py-2 border-t border-[var(--border-light)]">
			<span className="text-xs text-[var(--text-tertiary)] truncate flex-1">
				{session?.user?.email ?? ""}
			</span>
			<a href="/settings" onClick={navigateWithinReader} className="min-h-11 flex items-center shrink-0 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]">个人设置</a>
			<button
				onClick={handleSignOut}
				title="退出登录"
				className="text-xs text-[var(--text-tertiary)] hover:text-red-500 transition-colors shrink-0"
			>
				退出
			</button>
		</div>
	);
}
