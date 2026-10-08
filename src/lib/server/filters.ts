import {
	filterFields,
	parseFieldFilter,
	readFilterValues,
	type FilterSchema
} from '#lib/components/Filter/fields.js';
import { error } from '@sveltejs/kit';
import { and, eq, getTableColumns, gte, like, lt, lte, type Table } from 'drizzle-orm';

export function schemaFilters(schema: FilterSchema, table: Table, parameters: URLSearchParams) {
	const filters = readFilterValues(schema, parameters);
	const columns = getTableColumns(table);
	const conditions = filterFields(schema).flatMap((field) => {
		const result = parseFieldFilter(schema, field, filters);
		if (!result.success) error(400, result.error);
		if (!result.values.length) return [];
		const column = columns[field.key];
		if (!column) throw new Error(`Filter column not found: ${field.key}`);
		return result.values.map(({ key, value }) => {
			if (field.type === 'text') return like(column, `%${value}%`);
			if (field.type === 'date') {
				const date = value as Date;
				return key === `${field.key}.min`
					? gte(column, date)
					: lt(column, new Date(date.getTime() + 24 * 60 * 60 * 1000));
			}
			if (field.type === 'number')
				return key === `${field.key}.min` ? gte(column, value) : lte(column, value);
			return eq(column, value);
		});
	});
	return { filters, where: and(...conditions) };
}
