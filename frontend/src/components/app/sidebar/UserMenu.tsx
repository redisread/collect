import { authClient } from "@/lib/auth-client";

export function UserMenu() {
	const { data: session } = authClient.useSession();

	const handleSignOut = async () => {
		await authClient.signOut();
		window.location.href = "/login";
	};

	return (
		<div className="flex items-center gap-2 px-3 py-2 border-t border-[var(--border-light)]">
			<span className="text-xs text-[var(--text-tertiary)] truncate flex-1">
				{session?.user?.email ?? ""}
			</span>
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
