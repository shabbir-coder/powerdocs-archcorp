const ACC_PROJECTS_URL = 'https://task.archcorp.ai/functions/accProjectsPublic';

// Proxied server-side (not fetched directly from the browser) so it's consistent with
// the rest of the API — same auth gate, same origin for the frontend to call.
async function listProjects(req, res, next) {
  try {
    const upstream = await fetch(ACC_PROJECTS_URL);
    if (!upstream.ok) return res.status(502).json({ error: 'Could not reach the ACC projects feed' });
    const data = await upstream.json();
    res.json({ projects: data.projects || [] });
  } catch (err) {
    next(err);
  }
}

module.exports = { listProjects };
