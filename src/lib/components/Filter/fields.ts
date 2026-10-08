import z from 'zod';

export type FilterSchema = z.ZodObject<Record<string, z.ZodType>>;
export type FilterValues = Record<string, string>;
export type FilterField = {
	key: string;
	label: string;
	type: 'text' | 'number' | 'date' | 'boolean' | 'enum';
	options?: string[];
	min?: number;
	max?: number;
	step?: number | 'any';
};

export function filterFields(schema: FilterSchema): FilterField[] {
	return Object.entries(schema.shape).map(([key, field]) => {
		let base = field;
		while (
			base instanceof z.ZodOptional ||
			base instanceof z.ZodNullable ||
			base instanceof z.ZodDefault
		) {
			base = base.unwrap() as z.ZodType;
		}
		const label =
			field.meta()?.title ??
			base.meta()?.title ??
			key.replace(/([a-z\d])([A-Z])/g, '$1 $2').replace(/^./, (letter) => letter.toUpperCase());
		if (base instanceof z.ZodString) return { key, label, type: 'text' };
		if (base instanceof z.ZodBoolean) return { key, label, type: 'boolean' };
		if (base instanceof z.ZodDate) return { key, label, type: 'date' };
		if (base instanceof z.ZodNumber)
			return {
				key,
				label,
				type: 'number',
				min: base.minValue ?? undefined,
				max: base.maxValue ?? undefined,
				step: base.isInt ? 1 : 'any'
			};
		if (base instanceof z.ZodEnum)
			return { key, label, type: 'enum', options: base.options.map(String) };
		throw new Error(`Unsupported filter field: ${key}`);
	});
}

export function readFilterValues(schema: FilterSchema, parameters: URLSearchParams): FilterValues {
	return Object.fromEntries(
		filterFields(schema).flatMap((field) => {
			const keys = filterKeys(field);
			// Existing exact-value URLs become equal lower and upper bounds.
			const exact =
				keys.length === 2 && !keys.some((key) => parameters.has(`filter.${key}`))
					? parameters.get(`filter.${field.key}`)?.trim()
					: undefined;
			return keys.flatMap((key) => {
				const value = parameters.get(`filter.${key}`)?.trim() ?? exact;
				return value ? [[key, value]] : [];
			});
		})
	);
}

export function filterKeys(field: FilterField): string[] {
	return field.type === 'number' || field.type === 'date'
		? [`${field.key}.min`, `${field.key}.max`]
		: [field.key];
}

export function parseFieldFilter(schema: FilterSchema, field: FilterField, filters: FilterValues) {
	const values: { key: string; value: unknown }[] = [];
	for (const key of filterKeys(field)) {
		const raw = filters[key]?.trim();
		if (!raw) continue;
		const result = parseFilterValue(schema, field, raw);
		if (!result.success)
			return { success: false, error: `Enter a valid value for ${field.label}.` } as const;
		values.push({ key, value: result.data });
	}
	if (values.length === 2 && Number(values[0].value) > Number(values[1].value)) {
		const message =
			field.type === 'date'
				? 'start date must not exceed end date.'
				: 'minimum must not exceed maximum.';
		return { success: false, error: `${field.label}: ${message}` } as const;
	}
	return { success: true, values } as const;
}

export function parseFilterValue(schema: FilterSchema, field: FilterField, raw: string) {
	let value: string | number | boolean | Date = raw.trim();
	if (field.type === 'number') value = Number(value);
	if (field.type === 'boolean') {
		if (value !== 'true' && value !== 'false') return { success: false } as const;
		value = value === 'true';
	}
	if (field.type === 'date') {
		const dateString = raw.trim();
		if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) return { success: false } as const;
		const date = new Date(`${dateString}T00:00:00+08:00`);
		if (
			!Number.isFinite(date.getTime()) ||
			new Date(date.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10) !== dateString
		) {
			return { success: false } as const;
		}
		value = date;
	}
	return schema.shape[field.key].safeParse(value);
}
