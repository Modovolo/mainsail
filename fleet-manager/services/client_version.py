import json
import logging
import os
import re
from typing import Any, Dict


logger = logging.getLogger(__name__)

_CLIENT_VERSION_PATTERN = re.compile(r'^CLIENT_VERSION\s*=\s*["\']([^"\']+)["\']', re.MULTILINE)


def get_client_script_path() -> str:
    return os.path.join(os.path.dirname(os.path.dirname(__file__)), 'printer_client', 'fleet_client.py')


def load_client_script_version(default: str = 'unknown') -> str:
    client_file = get_client_script_path()

    try:
        with open(client_file, 'r') as f:
            content = f.read()

        match = _CLIENT_VERSION_PATTERN.search(content)
        if match:
            return match.group(1)

        logger.warning('CLIENT_VERSION not found in %s', client_file)
    except Exception as exc:
        logger.error('Failed to read fleet client version from %s: %s', client_file, exc)

    return default


def load_client_release_info() -> Dict[str, Any]:
    version_file = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'client_version.json')
    metadata: Dict[str, Any] = {}

    try:
        with open(version_file, 'r') as f:
            metadata = json.load(f)
    except Exception as exc:
        logger.error('Failed to read client release metadata: %s', exc)

    metadata['version'] = load_client_script_version(metadata.get('version', 'unknown'))
    metadata.setdefault('min_version', '0.0.0')
    return metadata