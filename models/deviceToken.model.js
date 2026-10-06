// Upsert keyed on the token: if the device was previously registered under
// another person (shared device, re-login), it moves to the new person.
async function upsert(pool, { token, personId, platform }) {
  await pool.request().input('token', token).input('person', personId).input('platform', platform).input('at', new Date())
    .query(`UPDATE dbo.DccDeviceTokens SET PersonId = @person, Platform = @platform, UpdatedAt = @at WHERE Token = @token;
            IF @@ROWCOUNT = 0
              INSERT INTO dbo.DccDeviceTokens (Token, PersonId, Platform, CreatedAt, UpdatedAt)
              VALUES (@token, @person, @platform, @at, @at)`);
}

async function removeForPerson(pool, token, personId) {
  const result = await pool.request().input('token', token).input('person', personId)
    .query('DELETE FROM dbo.DccDeviceTokens WHERE Token = @token AND PersonId = @person');
  return result.rowsAffected[0] > 0;
}

async function removeTokens(pool, tokens) {
  if (!tokens.length) return;
  const request = pool.request();
  const params = tokens.map((token, i) => {
    request.input(`t${i}`, token);
    return `@t${i}`;
  });
  await request.query(`DELETE FROM dbo.DccDeviceTokens WHERE Token IN (${params.join(', ')})`);
}

async function getTokensForPersons(pool, personIds) {
  if (!personIds.length) return [];
  const request = pool.request();
  const params = personIds.map((id, i) => {
    request.input(`p${i}`, id);
    return `@p${i}`;
  });
  const { recordset } = await request.query(`SELECT Token FROM dbo.DccDeviceTokens WHERE PersonId IN (${params.join(', ')})`);
  return recordset.map((r) => r.Token);
}

module.exports = { upsert, removeForPerson, removeTokens, getTokensForPersons };
