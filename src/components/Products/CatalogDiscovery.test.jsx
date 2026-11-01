import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import CatalogDiscovery from './CatalogDiscovery';
import { catalog, productDetails } from '../../lib/demo/catalog';

// The browser suite verifies Next's real history integration. These tests feed
// the current URL through the navigation boundary after a user action.
jest.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(window.location.search),
}));

const products = catalog.map(productDetails);
const productNames = () => screen.queryAllByRole('article').map((article) => within(article).getByRole('heading').textContent);
const search = () => screen.getByRole('searchbox', { name: 'Search products', exact: true });
const sort = () => screen.getByRole('combobox', { name: 'Sort products', exact: true });
let pushState;

beforeEach(() => {
  window.history.replaceState(null, '', '/');
  pushState = jest.spyOn(window.history, 'pushState');
});

afterEach(() => pushState.mockRestore());

function renderCatalog(url = '/', props = {}) {
  window.history.replaceState(null, '', url);
  const component = () => <CatalogDiscovery products={products} onAddToCart={jest.fn()} {...props} />;
  const view = render(component());
  return {
    ...view,
    refreshURL: (url) => {
      act(() => {
        if (url) window.history.replaceState(null, '', url);
        view.rerender(component());
      });
    },
  };
}

test('initializes search, sort, and useful results from a shared URL', () => {
  renderCatalog('/?q=cork&sort=price-desc');

  expect(search()).toHaveValue('cork');
  expect(sort()).toHaveValue('price-desc');
  expect(productNames()).toEqual(['Desk Mat']);
  expect(screen.getByRole('link', { name: 'Desk Mat', exact: true })).toHaveAttribute('href', '/products/desk-mat');
  expect(screen.getByRole('button', { name: 'Reset filters', exact: true })).toBeEnabled();
  expect(pushState).not.toHaveBeenCalled();
});

test('keeps typing as a draft until submit, then normalizes the URL without dropping unrelated parameters', async () => {
  const user = userEvent.setup();
  const view = renderCatalog('/?campaign=portfolio');
  const input = search();

  await user.type(input, '  CORK   backing  ');
  expect(productNames()).toHaveLength(6);
  expect(pushState).not.toHaveBeenCalled();
  await user.keyboard('{Enter}');
  view.refreshURL();

  const params = new URLSearchParams(window.location.search);
  expect(params.get('q')).toBe('CORK backing');
  expect(params.get('campaign')).toBe('portfolio');
  expect(params.has('sort')).toBe(false);
  expect(window.location.hash).toBe('#products');
  expect(productNames()).toEqual(['Desk Mat']);
  expect(search()).toBe(input);
  expect(search()).toHaveValue('CORK backing');
  expect(search()).toHaveFocus();
});

test('sorts the applied query while preserving an unsubmitted search draft', async () => {
  const user = userEvent.setup();
  const view = renderCatalog('/?q=desk');
  await user.clear(search());
  await user.type(search(), 'cork');
  await user.selectOptions(sort(), 'price-desc');
  view.refreshURL();

  expect(new URLSearchParams(window.location.search).get('q')).toBe('desk');
  expect(sort()).toHaveValue('price-desc');
  expect(search()).toHaveValue('cork');
  expect(productNames()).toEqual(['Desk Lamp', 'Laptop Stand', 'Desk Mat', 'Bottle']);
});

test('clears an empty search with guidance, preserves the selected sort, and restores input focus', async () => {
  const user = userEvent.setup();
  const view = renderCatalog('/?q=spaceship&sort=price-desc&campaign=portfolio');
  expect(screen.getByRole('heading', { name: 'No products found', exact: true })).toBeInTheDocument();
  expect(productNames()).toEqual([]);

  await user.click(screen.getByRole('button', { name: 'Clear search', exact: true }));
  view.refreshURL();

  const params = new URLSearchParams(window.location.search);
  expect(params.has('q')).toBe(false);
  expect(params.get('sort')).toBe('price-desc');
  expect(params.get('campaign')).toBe('portfolio');
  expect(productNames()).toEqual(['Desk Lamp', 'Laptop Stand', 'Desk Mat', 'Bottle', 'Tote', 'Notebook']);
  expect(search()).toHaveValue('');
  expect(search()).toHaveFocus();
  expect(screen.queryByRole('heading', { name: 'No products found' })).not.toBeInTheDocument();
});

test('resets search and sorting together without discarding unrelated URL state', async () => {
  const user = userEvent.setup();
  const view = renderCatalog('/?q=cork&sort=name-asc&campaign=portfolio');
  await user.click(screen.getByRole('button', { name: 'Reset filters', exact: true }));
  view.refreshURL();

  expect(window.location.search).toBe('?campaign=portfolio');
  expect(search()).toHaveValue('');
  expect(sort()).toHaveValue('featured');
  expect(productNames()).toEqual(products.map(({ name }) => name));
  expect(search()).toHaveFocus();
  expect(screen.queryByRole('button', { name: 'Reset filters', exact: true })).not.toBeInTheDocument();
});

test('restores the applied query from a URL change without replacing the focused input', async () => {
  const user = userEvent.setup();
  const view = renderCatalog('/?q=cork&sort=price-desc');
  const input = search();
  await user.clear(input);
  await user.type(input, 'unfinished draft');

  view.refreshURL('/?q=notebook&sort=name-asc');

  expect(search()).toBe(input);
  expect(search()).toHaveFocus();
  expect(search()).toHaveValue('notebook');
  expect(sort()).toHaveValue('name-asc');
  // Desk Mat's authored detail mentions a notebook, so both are valid matches.
  expect(productNames()).toEqual(['Desk Mat', 'Notebook']);
});

test('does not add redundant history entries for an unchanged search', async () => {
  const user = userEvent.setup();
  const view = renderCatalog('/?q=cork#products');
  await user.click(screen.getByRole('button', { name: 'Search', exact: true }));
  view.refreshURL();
  expect(pushState).not.toHaveBeenCalled();
  expect(productNames()).toEqual(['Desk Mat']);
});

test('keeps confirmed cart behavior available for a filtered result', async () => {
  const user = userEvent.setup();
  const onAddToCart = jest.fn().mockResolvedValue({ status: 'success' });
  renderCatalog('/?q=cork', { onAddToCart });
  await user.click(screen.getByRole('button', { name: 'Add to cart: Desk Mat', exact: true }));

  expect(onAddToCart).toHaveBeenCalledWith('demo-desk-mat', 1);
  expect(screen.getByRole('status')).toHaveTextContent('Desk Mat added to your cart.');
  expect(screen.getByRole('link', { name: 'View cart', exact: true })).toHaveAttribute('href', '/cart');
  expect(new URLSearchParams(window.location.search).get('q')).toBe('cork');
});

test('returns focus to search when filtering removes the product that triggered cart feedback', async () => {
  const user = userEvent.setup();
  const onAddToCart = jest.fn().mockResolvedValue({ status: 'success' });
  const view = renderCatalog('/', { onAddToCart });
  await user.click(screen.getByRole('button', { name: 'Add to cart: Desk Mat', exact: true }));
  expect(screen.getByRole('status')).toHaveTextContent('Desk Mat added to your cart.');

  await user.type(search(), 'cotton{Enter}');
  view.refreshURL();
  expect(productNames()).toEqual(['Tote']);
  expect(screen.queryByRole('button', { name: 'Add to cart: Desk Mat', exact: true })).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Dismiss cart confirmation', exact: true }));

  expect(screen.getByRole('status')).toBeEmptyDOMElement();
  expect(search()).toHaveFocus();
});
