import { test } from 'node:test';
import assert from 'node:assert/strict';
import { demarrerServeur } from './index.js';

test('/sante répond 200', async () => {
  const serveur = await demarrerServeur(0);
  const { port } = serveur.address();

  const reponse = await fetch(`http://localhost:${port}/sante`);

  assert.equal(reponse.status, 200);
  assert.deepEqual(await reponse.json(), { ok: true });
  serveur.close();
});
