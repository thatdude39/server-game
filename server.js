require('dotenv').config();
const express = require('express');
const { Octokit } = require('@octokit/rest');

const app = express();
app.use(express.json());
app.use(express.static('public'));

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
const owner = process.env.REPO_OWNER;
const repo = process.env.REPO_NAME;

const chatLog = [];

app.get('/api/messages', (req, res) => {
  res.json(chatLog);
});

app.post('/api/send', async (req, res) => {
  const { filename, content } = req.body;

  if (!filename || !content) {
    return res.status(400).json({ error: 'filename and content are required' });
  }

  chatLog.push({ role: 'user', filename, content, time: new Date().toISOString() });

  try {
    let sha;
    try {
      const { data } = await octokit.repos.getContent({ owner, repo, path: filename });
      sha = data.sha;
    } catch (_) {}

    await octokit.repos.createOrUpdateFileContents({
      owner,
      repo,
      path: filename,
      message: `update ${filename}`,
      content: Buffer.from(content).toString('base64'),
      ...(sha && { sha }),
    });

    const entry = { role: 'system', text: `committed: ${filename}`, time: new Date().toISOString() };
    chatLog.push(entry);
    res.json({ success: true, committed: filename });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`running on http://localhost:${PORT}`));
