
function sortNode(node) {
    if (!node.children) return
    node.children.sort((a, b) => {
        if (a.type !== b.type) return a.type === "folder" ? -1 : 1
        return a.name.localeCompare(b.name)
    })
    node.children.forEach(sortNode)
}

export function buildTree(files) {
    const root = { name: "", type: "folder", path: "", children: [] }

    for (const file of files) {
        const parts = file.path.split("/").filter(Boolean)
        let node = root

        parts.forEach((part, i) => {
            const path = parts.slice(0, i + 1).join("/")
            const is_file = i === parts.length - 1
            const type = is_file ? "file" : "folder"
            let child = node.children.find((c) => c.name === part && c.type === type)

            if (!child) {
                child = is_file
                    ? { name: part, type, path }
                    : { name: part, type, path, children: [] }
                node.children.push(child)
            }
            node = child
        })
    }

    sortNode(root)
    return root
}

export function folderPaths(files) {
    const set = new Set()
    for (const file of files) {
        const parts = file.path.split("/").filter(Boolean)
        for (let i = 1; i < parts.length; i++) {
            set.add(parts.slice(0, i).join("/"))
        }
    }
    return set
}