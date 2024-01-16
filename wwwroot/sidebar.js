async function getJSON(url) {
    const resp = await fetch(url);
    if (!resp.ok) {
        alert('Could not load tree data. See console for more details.');
        console.error(await resp.text());
        return [];
    }
    return resp.json();
}

function createTreeNode(id, text, icon, children = false) {
    return { id, text, children, itree: { icon } };
}

async function getHubs() {
    const hubs = await getJSON('/api/hubs');
    return hubs.map(hub => createTreeNode(`hub|${hub.id}`, hub.attributes.name, 'icon-hub', true));
}

async function getProjects(hubId) {
    const projects = await getJSON(`/api/hubs/${hubId}/projects`);
    return projects.map(project => createTreeNode(`project|${hubId}|${project.id}|${Object.values(project.attributes.scopes).join(',')}`, project.attributes.name, 'icon-project', true));
}

async function getContents(hubId, projectId, folderId = null) {
    const contents = await getJSON(`/api/hubs/${hubId}/projects/${projectId}/contents` + (folderId ? `?folder_id=${folderId}` : ''));
    return contents.map(item => {
        if (item.type === 'folders') {
            return createTreeNode(`folder|${hubId}|${projectId}|${item.id}`, item.attributes.displayName, 'icon-my-folder', true);
        } else {
            return createTreeNode(`item|${hubId}|${projectId}|${item.id}`, item.attributes.displayName, 'icon-item', true);
        }
    });
}

async function getVersions(hubId, projectId, itemId) {
    const versions = await getJSON(`/api/hubs/${hubId}/projects/${projectId}/contents/${itemId}/versions`);
    let versionsWithStorage = versions.filter(v => !!v.relationships.storage);
    return versionsWithStorage.map(version => createTreeNode(`version|${version.id}|${version.relationships.storage.meta.link.href.replace('?','/signeds3download?')}`, version.attributes.createTime, 'icon-version'));
}

export function initTree(selector, onSelectionChanged) {
    // See http://inspire-tree.com
    const tree = new InspireTree({
        data: function (node) {
            if (!node || !node.id) {
                return getHubs();
            } else {
                const tokens = node.id.split('|');
                switch (tokens[0]) {
                    case 'hub': return getProjects(tokens[1]);
                    case 'project': return getContents(tokens[1], tokens[2]);
                    case 'folder': return getContents(tokens[1], tokens[2], tokens[3]);
                    case 'item': return getVersions(tokens[1], tokens[2], tokens[3]);
                    default: return [];
                }
            }
        }
    });
    tree.on('node.click', async function (event, node) {
        event.preventTreeDefault();
        const tokens = node.id.split('|');
        if (tokens[0] === 'version') {
            let projectNode = node.getParents().find(p => p.id.includes('project'));
            onSelectionChanged(tokens[1], projectNode.id.split('|')[3]);
        }
        if (tokens[0] === 'item') {
            let projectNode = node.getParents().find(p => p.id.includes('project'));
            let scopes = projectNode.id.split('|')[3];
            Swal.fire({
                title: 'Want to download this file?',
                cancelButtonText: 'No, thanks!',
                showCancelButton: true,
                confirmButtonText: 'Yes, please!',
                preConfirm: async () => {
                    handleFileDownload(node.children[0].id.split('|')[2], node.text); 
                },
                allowOutsideClick: () => !Swal.isLoading()
              })
            // downloadFile(node.children[0].relationships.storage.meta.link.href.replace('?','/signeds3download?'));
        }
    });
    return new InspireTreeDOM(tree, { target: selector });
}

async function handleFileDownload(downloadURL, fileName){
    let access_token = await getAccessToken();
    const options = {
        method: 'GET',
        headers: {
          Authorization: 'Bearer '+access_token
        }
      };
    const resp = await fetch(downloadURL, options);
    let respJSON = await resp.json();
    downloadFile(respJSON.url, fileName);

}
async function downloadFile(downloadURL, fileName) {
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = downloadURL;
    a.download = fileName;
    a.target = "_blank";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

async function getAccessToken() {
    try {
        const resp = await fetch('/api/auth/token');
        if (!resp.ok)
            throw new Error(await resp.text());
        const { access_token, expires_in } = await resp.json();
        return access_token;
    } catch (err) {
        alert('Could not obtain access token. See the console for more details.');
        console.error(err);        
    }
}