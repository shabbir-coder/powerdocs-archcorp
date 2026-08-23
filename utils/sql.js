// Builds a parameterized `IN (@p0, @p1, ...)` clause and binds each value
// on the given request, so caller-controlled id lists never get interpolated
// into the query string.
function bindInClause(request, paramPrefix, values) {
  const names = values.map((v, i) => {
    const name = `${paramPrefix}${i}`;
    request.input(name, v);
    return `@${name}`;
  });
  return names.join(', ');
}

module.exports = { bindInClause };
