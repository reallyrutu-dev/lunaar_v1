"use client"

import { useMemo, useState } from "react"
import { ChevronDown, ChevronRight, Download, File, Folder, FolderOpen } from "lucide-react"
import { buildTree, folderPaths } from "../utils/fileTree"
import styles from "./filesystem.module.css"

function TreeNode({ node, depth, selected, open_folders, onToggle, onSelect }) {
    const pad = { paddingLeft: 12 + depth * 14 }

    if (node.type === "folder") {
        const is_open = open_folders.has(node.path)
        return (
            <div>
                <button className={styles.row} style={pad} onClick={() => onToggle(node.path)}>
                    {is_open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    {is_open ? <FolderOpen size={14} /> : <Folder size={14} />}
                    <span>{node.name}</span>
                </button>
                {is_open &&
                    node.children.map((child) => (
                        <TreeNode
                            key={child.path}
                            node={child}
                            depth={depth + 1}
                            selected={selected}
                            open_folders={open_folders}
                            onToggle={onToggle}
                            onSelect={onSelect}
                        />
                    ))}
            </div>
        )
    }

    return (
        <button
            className={`${styles.row} ${selected === node.path ? styles.active : ""}`}
            style={{ ...pad, paddingLeft: pad.paddingLeft + 18 }}
            onClick={() => onSelect(node.path)}
        >
            <File size={14} />
            <span>{node.name}</span>
        </button>
    )
}

export default function FileSystem({ folder_name, files }) {
    const [contents, setContents] = useState(() =>
        Object.fromEntries(files.map((f) => [f.path, f.content]))
    )
    const [selected, setSelected] = useState(files[0]?.path || null)
    const [open_folders, setOpen_folders] = useState(() => folderPaths(files))

    const tree = useMemo(() => buildTree(files), [files])

    const toggleFolder = (path) => {
        setOpen_folders((prev) => {
            const next = new Set(prev)
            if (next.has(path)) next.delete(path)
            else next.add(path)
            return next
        })
    }

    const handleChange = (value) => {
        setContents((prev) => ({ ...prev, [selected]: value }))
    }

    const handleDownload = async () => {
        const JSZip = (await import("jszip")).default
        const zip = new JSZip()
        const dir = zip.folder(folder_name)
        Object.entries(contents).forEach(([path, content]) => dir.file(path, content))
        const blob = await zip.generateAsync({ type: "blob" })
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = `${folder_name}.zip`
        a.click()
        URL.revokeObjectURL(url)
    }

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <span className={styles.title}>{folder_name}/</span>
                <button className={styles.icon_btn} onClick={handleDownload} aria-label="Download zip">
                    <Download size={16} />
                </button>
            </div>

            <div className={styles.body}>
                <div className={styles.explorer}>
                    <div className={styles.root_label}>{folder_name}</div>
                    {tree.children.map((child) => (
                        <TreeNode
                            key={child.path}
                            node={child}
                            depth={0}
                            selected={selected}
                            open_folders={open_folders}
                            onToggle={toggleFolder}
                            onSelect={setSelected}
                        />
                    ))}
                </div>

                <div className={styles.editor}>
                    {selected ? (
                        <>
                            <div className={styles.tab}>{selected}</div>
                            <textarea
                                className={styles.code}
                                value={contents[selected] ?? ""}
                                onChange={(e) => handleChange(e.target.value)}
                                spellCheck={false}
                            />
                        </>
                    ) : (
                        <div className={styles.empty}>Select a file</div>
                    )}
                </div>
            </div>
        </div>
    )
}