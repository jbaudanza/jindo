export function toSQL(filters) {
  const conditions = [];
  const values = [];

  Object.keys(filters).forEach(function(key) {
    let value = filters[key];
    let operator = '=';

    if (typeof value === 'object') {
      const keys = Object.keys(value);
      if (keys.length === 1) {
        switch (keys[0]) {
          case '$gt':
            value = value[keys[0]];
            operator = '>';
            break;
          case '$lt':
            value = value[keys[0]];
            operator = '<';
            break;
          case '$eq':
            value = value[keys[0]];
            operator = '=';
            break;
        }
      }
    }

    conditions.push(`${key} ${operator} $${conditions.length + 1}`);
    values.push(value);
  });

  return [conditions.join(' AND '), values];
}
