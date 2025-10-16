import { query } from '../db/index.js';

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

export function createCatalogModule(options = {}) {
  const log = options.logger || ((payload) => console.log(JSON.stringify(payload)));

  function normalizePagination({ page, pageSize } = {}) {
    const normalizedPage = Number.parseInt(page, 10);
    const safePage = Number.isFinite(normalizedPage) && normalizedPage > 0 ? normalizedPage : DEFAULT_PAGE;

    const normalizedPageSize = Number.parseInt(pageSize, 10);
    const safePageSize = Number.isFinite(normalizedPageSize) && normalizedPageSize > 0
      ? Math.min(MAX_PAGE_SIZE, normalizedPageSize)
      : DEFAULT_PAGE_SIZE;

    const offset = (safePage - 1) * safePageSize;
    return { page: safePage, pageSize: safePageSize, offset, limit: safePageSize };
  }

  function mapMerchantRow(row) {
    if (!row) {
      return null;
    }

    return {
      id: row.id,
      nombre: row.nombre,
      categoria: row.categoria,
      municipio: row.municipio,
      descuento: typeof row.descuento === 'number' ? row.descuento : Number(row.descuento ?? 0),
      direccion: row.direccion,
      horario: row.horario,
      descripcion: row.descripcion ?? null,
      lat: row.lat === null || row.lat === undefined ? null : Number(row.lat),
      lng: row.lng === null || row.lng === undefined ? null : Number(row.lng),
    };
  }

  async function getCatalog({ filters = {} } = {}) {
    const { categoria, municipio } = filters;
    const search = typeof filters.q === 'string' ? filters.q.trim() : '';
    const pagination = normalizePagination({ page: filters.page, pageSize: filters.pageSize });

    const whereParts = ['activo = true'];
    const whereValues = [];

    if (categoria) {
      whereValues.push(categoria);
      whereParts.push(`categoria = $${whereValues.length}`);
    }

    if (municipio) {
      whereValues.push(municipio);
      whereParts.push(`municipio = $${whereValues.length}`);
    }

    if (search) {
      const likeValue = `%${search}%`;
      whereValues.push(likeValue);
      const placeholder = `$${whereValues.length}`;
      whereParts.push(`(nombre ILIKE ${placeholder} OR descripcion ILIKE ${placeholder})`);
    }

    const whereClause = whereParts.length > 0 ? `WHERE ${whereParts.join(' AND ')}` : '';

    try {
      const countResult = await query(`SELECT COUNT(*) AS count FROM merchants ${whereClause}`, whereValues);
      const total = Number(countResult.rows[0]?.count || 0);
      const totalPages = total === 0 ? 0 : Math.ceil(total / pagination.pageSize);

      const listParams = whereValues.slice();
      listParams.push(pagination.limit, pagination.offset);
      const limitPlaceholder = `$${listParams.length - 1}`;
      const offsetPlaceholder = `$${listParams.length}`;
      const listQuery = `
        SELECT id, nombre, categoria, municipio, descuento, direccion, horario, descripcion, lat, lng
          FROM merchants
          ${whereClause}
         ORDER BY nombre ASC
         LIMIT ${limitPlaceholder}
        OFFSET ${offsetPlaceholder}
      `;
      const itemsResult = await query(listQuery, listParams);
      const items = itemsResult.rows.map(mapMerchantRow);

      return {
        statusCode: 200,
        payload: {
          items,
          page: pagination.page,
          pageSize: pagination.pageSize,
          total,
          totalPages,
        },
      };
    } catch (error) {
      log({ level: 'error', message: 'catalog_list_failed', error: error.message });
      throw error;
    }
  }

  async function getMerchantById({ id }) {
    if (!id) {
      return { statusCode: 404, payload: { error: 'catalog_item_not_found' } };
    }

    try {
      const result = await query(
        `SELECT id, nombre, categoria, municipio, descuento, direccion, horario, descripcion, lat, lng
           FROM merchants
          WHERE id = $1 AND activo = true
          LIMIT 1`,
        [id],
      );

      if (result.rowCount === 0) {
        return { statusCode: 404, payload: { error: 'catalog_item_not_found' } };
      }

      return {
        statusCode: 200,
        payload: mapMerchantRow(result.rows[0]),
      };
    } catch (error) {
      log({ level: 'error', message: 'catalog_fetch_failed', error: error.message, merchant_id: id });
      throw error;
    }
  }

  return {
    getCatalog,
    getMerchantById,
  };
}
