import { Role } from '#lib/Roles.js';
import { resolve } from '$app/paths';
import type { ResolvedPathname } from '$app/types';
import {
	Bell,
	BookOpen,
	ClipboardCheck,
	Gauge,
	GraduationCap,
	Mail,
	Settings,
	SquareChartGantt,
	SquareUserRound,
	UserRound,
	Users,
	UserShield
} from '@lucide/svelte';

type SidebarEntry = {
	label: string;
	icon: typeof Gauge;
	roles?: readonly Role[];
};

export type SidebarLink = SidebarEntry & { href: ResolvedPathname };
export type SidebarGroup = SidebarEntry & { id: string; children: SidebarLink[] };
export type SidebarItem = SidebarLink | SidebarGroup;

const staff = [Role.ADMIN, Role.REGISTRAR];
const items: SidebarItem[] = [
	{ label: 'Dashboard', href: resolve('/user/dashboard'), icon: Gauge },
	{ label: 'Registrars', href: resolve('/user/registrars'), icon: UserShield, roles: [Role.ADMIN] },
	{ label: 'Applicants', href: resolve('/user/applicants'), icon: SquareUserRound, roles: staff },
	{ label: 'Students', href: resolve('/user/students'), icon: Users, roles: staff },
	{ label: 'Enrollment', href: resolve('/user/enrollment'), icon: ClipboardCheck },
	{
		label: 'Subjects',
		href: resolve('/user/subjects'),
		icon: BookOpen,
		roles: [Role.ADMIN, Role.STUDENT]
	},
	{ label: 'Programs', href: resolve('/user/programs'), icon: GraduationCap, roles: [Role.ADMIN] },
	{ label: 'Notifications', href: resolve('/user/notifications'), icon: Bell },
	{ label: 'Reports', href: resolve('/user/reports'), icon: SquareChartGantt, roles: staff },
	{
		id: 'settings',
		label: 'Settings',
		icon: Settings,
		children: [
			{ label: 'Email', href: resolve('/user/settings/email'), icon: Mail, roles: [Role.ADMIN] },
			{ label: 'Profile', href: resolve('/user/settings/profile'), icon: UserRound }
		]
	}
];

export function getSidebarItems(role: string | null | undefined): SidebarItem[] {
	if (!Object.values(Role).some((knownRole) => knownRole === role)) return [];
	const allowed = (item: SidebarEntry) =>
		!item.roles || item.roles.some((allowedRole) => allowedRole === role);
	return items.filter(allowed).flatMap<SidebarItem>((item) => {
		if (!('children' in item)) return [item];
		const children = item.children.filter(allowed);
		return children.length ? [{ ...item, children }] : [];
	});
}

export function isActiveLink(href: string, pathname: string): boolean {
	const current = pathname.replace(/\/+$/, '');
	const target = href.replace(/\/+$/, '');
	return current === target || current.startsWith(target + '/');
}

export function isActiveItem(item: SidebarItem, pathname: string): boolean {
	return 'children' in item
		? item.children.some((child) => isActiveLink(child.href, pathname))
		: isActiveLink(item.href, pathname);
}
