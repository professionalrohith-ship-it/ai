/** Parent folder paths of a file, outermost first ("a/b/c.ts" gives ["a", "a/b"]). */
export function ancestorFolders(path: string): string[] {
  const parts = path.split('/')
  const folders: string[] = []
  for (let index = 1; index < parts.length; index += 1) folders.push(parts.slice(0, index).join('/'))
  return folders
}
