"use client";

import Link from "next/link";
import { UserButton, useUser } from "@stackframe/stack";
import {
	Bot,
	BookOpen,
	Boxes,
	Clock3,
	FileText,
	Folder,
	GitBranch,
	Globe,
	Image,
	LayoutDashboard,
	Search,
	Share2,
	Users,
} from "lucide-react";
import type { ReactNode } from "react";

const navItems = [
	{ label: "Workspace", href: "/app", icon: LayoutDashboard },
	{ label: "Projects", href: "/app", icon: Folder },
	{ label: "Recent", href: "/app", icon: Clock3 },
	{ label: "Docs", href: "/app", icon: FileText },
	{ label: "Public", href: "/app", icon: Globe },
	{ label: "Templates", href: "/app", icon: Boxes },
];

const futureItems = [
	{ label: "Collab", icon: Users },
	{ label: "AI", icon: Bot },
	{ label: "Exports", icon: Image },
	{ label: "Share", icon: Share2 },
	{ label: "Notes", icon: BookOpen },
];

export function AppShell({
	children,
	title,
	subtitle,
	syncLabel,
	action,
}: {
	children: ReactNode;
	title: string;
	subtitle?: string;
	syncLabel?: string;
	action?: ReactNode;
}) {
	const user = useUser();

	return (
		<div className="min-h-screen bg-[#f7f5f0] text-[#1f2328]">
			<aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-[#ddd6ca] bg-[#fdfbf7] px-4 py-5 lg:block">
				<Link href="/" className="flex items-center gap-3">
					<div className="grid size-9 place-items-center rounded-lg bg-[#1f2328] text-sm font-semibold text-white">SF</div>
					<div>
						<div className="text-sm font-semibold">Sketchflow</div>
						<div className="text-xs text-[#6b6258]">GitHub-native canvas</div>
					</div>
				</Link>

				<nav className="mt-8 space-y-1">
					{navItems.map((item) => (
						<Link
							key={item.label}
							href={item.href}
							className="flex h-9 items-center gap-3 rounded-md px-3 text-sm text-[#504a43] hover:bg-[#f0ece4] hover:text-[#1f2328]"
						>
							<item.icon aria-hidden className="size-4" strokeWidth={1.8} />
							{item.label}
						</Link>
					))}
				</nav>

				<div className="mt-8 border-t border-[#e4ded4] pt-5">
					<div className="mb-2 px-3 text-xs font-medium uppercase text-[#7a7167]">Coming next</div>
					<div className="grid grid-cols-2 gap-2">
						{futureItems.map((item) => (
							<div key={item.label} className="flex h-9 items-center gap-2 rounded-md border border-[#e4ded4] px-2 text-xs text-[#7a7167]">
								<item.icon aria-hidden className="size-3.5" strokeWidth={1.8} />
								{item.label}
							</div>
						))}
					</div>
				</div>
			</aside>

			<div className="lg:pl-64">
				<header className="sticky top-0 z-20 border-b border-[#ddd6ca] bg-[#fdfbf7]/95 px-4 py-3 backdrop-blur sm:px-6">
					<div className="flex items-center justify-between gap-4">
						<div className="min-w-0">
							<h1 className="truncate text-lg font-semibold">{title}</h1>
							{subtitle ? <p className="truncate text-sm text-[#6b6258]">{subtitle}</p> : null}
						</div>
						<div className="flex items-center gap-2">
							<div className="hidden h-9 min-w-64 items-center gap-2 rounded-md border border-[#ddd6ca] bg-white px-3 text-sm text-[#7a7167] md:flex">
								<Search aria-hidden className="size-4" strokeWidth={1.8} />
								<span>Search sketches, docs, commits</span>
							</div>
							{syncLabel ? (
								<div className="hidden h-9 items-center gap-2 rounded-md border border-[#cbd8d0] bg-[#eef7f1] px-3 text-xs text-[#315a3f] sm:flex">
									<GitBranch aria-hidden className="size-3.5" strokeWidth={1.8} />
									{syncLabel}
								</div>
							) : null}
							{action}
							{user ? <UserButton /> : null}
						</div>
					</div>
				</header>

				<main className="px-4 py-5 sm:px-6">{children}</main>
			</div>
		</div>
	);
}
