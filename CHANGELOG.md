# Change Log

All notable changes to the "invisifolder" extension will be documented in this file.

## [Unreleased]

### Added
- Pre-release workflow for automated publishing to VS Code Marketplace
  - GitHub Actions workflow triggered on pushes to `pre-release` branch
  - Automated extension packaging and publishing as pre-release versions
  - Hardened workflow with explicit permissions and robust checkout strategy

## [0.0.2] - 2026-01-17

### Changed
- Updated menu positioning in explorer context menu
- Improved package.json metadata and description
- Enhanced logo and icon assets
- Enhanced README documentation with usage examples and screenshots
- Development and publishing instructions

## [0.0.1] - Initial Release

### Added
- Hide/unhide folders in VS Code workspace
- Status bar item showing count of hidden folders
- Explorer context menu integration
- Commands:
  - `Invisifolder: Hide Folder`
  - `Invisifolder: Unhide Folder`
  - `Invisifolder: Toggle Folder Visibility`
  - `Invisifolder: Manage Hidden Folders`
- Workspace settings integration (`invisifolder.hiddenFolders`)
- Automatic `files.exclude` management
- Multi-root workspace support
