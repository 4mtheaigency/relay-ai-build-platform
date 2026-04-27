const axios = require('axios');

const RAILWAY_API = 'https://backboard.railway.app/graphql/v2';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function headers(token) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

async function gql(token, query, variables = {}) {
  let res;
  try {
    res = await axios.post(RAILWAY_API, { query, variables }, { headers: headers(token), timeout: 25000 });
  } catch (err) {
    const msg = err.response ? `HTTP ${err.response.status}: ${JSON.stringify(err.response.data)}` : err.message;
    throw new Error(`Railway network error: ${msg}`);
  }
  if (res.data.errors?.length) {
    throw new Error(`Railway: ${res.data.errors.map(e => e.message).join('; ')}`);
  }
  return res.data.data;
}

async function createProject(token, name) {
  const d = await gql(token, `
    mutation ProjectCreate($input: ProjectCreateInput!) {
      projectCreate(input: $input) { id name }
    }`, { input: { name } });
  return d.projectCreate;
}

async function getDefaultEnvironment(token, projectId, attempt = 0) {
  const d = await gql(token, `
    query Project($id: String!) {
      project(id: $id) { environments { edges { node { id name } } } }
    }`, { id: projectId });
  const envs = (d.project.environments.edges || []).map(e => e.node);
  if (!envs.length && attempt < 5) { await sleep(2000); return getDefaultEnvironment(token, projectId, attempt + 1); }
  return envs.find(e => /prod/i.test(e.name)) || envs[0] || null;
}

async function createService(token, projectId, repoFullName, name) {
  const d = await gql(token, `
    mutation ServiceCreate($input: ServiceCreateInput!) {
      serviceCreate(input: $input) { id name }
    }`, { input: { projectId, name, source: { repo: repoFullName } } });
  return d.serviceCreate;
}

async function createDomain(token, serviceId, environmentId) {
  const d = await gql(token, `
    mutation ServiceDomainCreate($input: ServiceDomainCreateInput!) {
      serviceDomainCreate(input: $input) { domain }
    }`, { input: { serviceId, environmentId } });
  return d.serviceDomainCreate.domain;
}

async function getLatestDeployment(token, projectId, serviceId) {
  try {
    const d = await gql(token, `
      query Deployments($input: DeploymentListInput!) {
        deployments(input: $input) {
          edges { node { id status staticUrl createdAt } }
        }
      }`, { input: { projectId, serviceId } });
    const edges = d.deployments?.edges || [];
    return edges.length ? edges[0].node : null;
  } catch (_) { return null; }
}

async function getDeploymentStatus(projectId, serviceId) {
  const token = process.env.RAILWAY_TOKEN;
  if (!token || !projectId || !serviceId) return null;
  return getLatestDeployment(token, projectId, serviceId);
}

async function deployToRailway(repoFullName, crossRefId) {
  const token = process.env.RAILWAY_TOKEN;
  if (!token) throw new Error('RAILWAY_TOKEN is not set');

  const projectName = `relay-${crossRefId}`;

  const project = await createProject(token, projectName);
  await sleep(3500);

  const env = await getDefaultEnvironment(token, project.id);
  if (!env) {
    throw new Error(
      `Railway project created (${project.id}) but no environment found. ` +
      `Ensure GitHub is connected: railway.app → Settings → Integrations → GitHub`
    );
  }

  const service = await createService(token, project.id, repoFullName, 'web');
  await sleep(2500);

  let domain = null;
  let domainError = null;
  try {
    domain = await createDomain(token, service.id, env.id);
  } catch (err) {
    domainError = err.message;
    console.error('Railway domain creation failed:', err.message);
  }

  return {
    project_id: project.id,
    service_id: service.id,
    environment_id: env.id,
    deploy_url: domain ? `https://${domain}` : null,
    railway_project_url: `https://railway.app/project/${project.id}`,
    domain_error: domainError,
  };
}

module.exports = { deployToRailway, getDeploymentStatus };
