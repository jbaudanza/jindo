// Convenience functions for doing immutable operations on ES6 sets

export function difference(set1: Set, set2: Set): Set {
  const result = new Set();

  for (let i of set1) {
    if (!set2.has(i)) {
      result.add(i);
    }
  }

  return result;
}


export function union(set1: Set, set2: Set): Set {
  const result = new Set();

  function add(v) {
    result.add(v);
  }

  set1.forEach(add);
  set2.forEach(add);

  return result;
}


export function add(set: Set, value: any): Set {
  const result = new Set(set);
  result.add(value);
  return result;
}


export function remove(set: Set, value: any): Set {
  const result = new Set(set);
  result.delete(value);
  return result;
}


export function map(set: Set, fn: Function): Array<any> {
  const result = [];

  set.forEach(function(v) {
    result.push(fn(v));
  });

  return result;
}
