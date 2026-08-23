import { api, unwrap } from '@/api/client.ts';
import type { Catalog, Product } from '@/types/catalog.ts';

export const fetchCatalog = () => unwrap<Catalog>(api.get('catalog'));

export const fetchProduct = (id: number) => unwrap<Product>(api.get(`catalog/products/${id}`));
