#!/bin/bash
# npx wrapper for Claude Desktop - fixes PATH issues with multiple Node versions
# Replace NODE_VERSION with your working Node version (e.g., v22.20.0)

NODE_VERSION="v22.20.0"
NVM_DIR="${HOME}/.nvm"

export PATH="${NVM_DIR}/versions/node/${NODE_VERSION}/bin:$PATH"
exec "${NVM_DIR}/versions/node/${NODE_VERSION}/bin/npx" "$@"
