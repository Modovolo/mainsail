export interface EditorState {
    bool: boolean
    diffMode: boolean
    splitMode: boolean
    filename: string
    fileroot: string
    permissions: string
    filepath: string
    sourcecode: string
    splitLeftTitle: string
    splitRightTitle: string
    splitLeftFilename: string
    splitRightFilename: string
    splitLeftContent: string
    splitRightContent: string
    loaderBool: boolean
    loaderProgress: {
        direction: 'downloading' | 'uploading'
        loaded: number
        total: number
        speed: string
    }
    cancelToken: any
    loadedHash: string
    changed: boolean
}
