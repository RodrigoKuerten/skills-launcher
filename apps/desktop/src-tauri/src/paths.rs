use std::path::{Path, PathBuf};

/// Windows canonicalize returns a verbatim `\\?\` path. It is valid but ugly in
/// the UI and in backups, so normalize it at the boundary.
pub fn clean_path(path: PathBuf) -> PathBuf {
    #[cfg(windows)]
    {
        if let Some(value) = path.to_str() {
            if let Some(rest) = value.strip_prefix(r"\\?\UNC\") {
                return PathBuf::from(format!(r"\\{rest}"));
            }
            if let Some(rest) = value.strip_prefix(r"\\?\") {
                return PathBuf::from(rest);
            }
        }
    }
    path
}

pub fn is_reparse(metadata: &std::fs::Metadata) -> bool {
    if metadata.file_type().is_symlink() {
        return true;
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x400;
        if metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0 {
            return true;
        }
    }
    false
}

pub fn canonical(path: &Path) -> std::io::Result<PathBuf> {
    Ok(clean_path(std::fs::canonicalize(path)?))
}

pub fn canonical_or_create(path: &Path) -> std::io::Result<PathBuf> {
    std::fs::create_dir_all(path)?;
    canonical(path)
}
