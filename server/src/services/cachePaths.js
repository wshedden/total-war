import path from 'node:path';

const root = process.cwd();
export const paths = {
  root,
  data: path.join(root, 'data'),
  raw: path.join(root, 'data', 'raw'),
  cache: path.join(root, 'data', 'cache'),
  borders: path.join(root, 'data', 'cache', 'borders.topo.json'),
  countryIndex: path.join(root, 'data', 'cache', 'countryIndex.json'),
  meta: path.join(root, 'data', 'cache', 'meta.json'),
  overrides: path.join(root, 'data', 'codeOverrides.json')
};
