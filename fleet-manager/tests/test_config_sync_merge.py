"""Regression tests for config-sync source merging behavior."""

from routes.config_sync import (
    compose_printer_object_source,
    migrate_template_with_source,
    resolve_template_target_path,
    select_templates_for_sync,
)


def test_compose_printer_object_source_merges_split_object_cfg_files():
    source_entry = {
        'path': 'printer.cfg',
        'content': '[stepper_x]\nstep_pin: PC1\n',
        'origin': 'runtime_snapshot',
    }
    source_files = [
        source_entry,
        {
            'path': 'hermit-crab-2board_left.cfg',
            'content': '[mcu HermitCrab2_Board_1_left]\ncanbus_uuid: faa18fecc855\n',
            'origin': 'runtime_snapshot',
        },
        {
            'path': 'IDEX.cfg',
            'content': '[dual_carriage]\nposition_endstop: 362\n',
            'origin': 'runtime_snapshot',
        },
        {
            'path': 'mainsail-idex.cfg',
            'content': '[gcode_macro TEST]\ngcode:\n  RESPOND MSG="hello"\n',
            'origin': 'runtime_snapshot',
        },
    ]

    merged = compose_printer_object_source(source_entry, source_files)

    assert merged['path'] == 'printer.cfg'
    assert merged['origin'] == 'runtime_snapshot'
    assert merged['mergedPaths'][0] == 'printer.cfg'
    assert 'mainsail-idex.cfg' not in merged['mergedPaths']
    assert 'hermit-crab-2board_left.cfg' in merged['mergedPaths']
    assert 'IDEX.cfg' in merged['mergedPaths']



def test_migrate_template_uses_values_from_merged_split_sources():
    template_content = (
        '[stepper_x]\n'
        'step_pin: PF0\n\n'
        '[dual_carriage]\n'
        'position_endstop: 359\n\n'
        '[mcu HermitCrab2_Board_1_left]\n'
        'canbus_uuid: 000000000000\n'
    )

    source_entry = {
        'path': 'printer.cfg',
        'content': '[stepper_x]\nstep_pin: PC1\n',
        'origin': 'runtime_snapshot',
    }
    source_files = [
        source_entry,
        {
            'path': 'IDEX.cfg',
            'content': '[dual_carriage]\nposition_endstop: 362\n',
            'origin': 'runtime_snapshot',
        },
        {
            'path': 'hermit-crab-2board_left.cfg',
            'content': '[mcu HermitCrab2_Board_1_left]\ncanbus_uuid: faa18fecc855\n',
            'origin': 'runtime_snapshot',
        },
    ]

    merged = compose_printer_object_source(source_entry, source_files)
    migrated = migrate_template_with_source(template_content, merged['content'])

    assert 'step_pin: PC1' in migrated
    assert 'position_endstop: 362' in migrated
    assert 'canbus_uuid: faa18fecc855' in migrated


def test_resolve_template_target_path_prefers_source_path_then_name():
    class Template:
        def __init__(self, source_path, name, filename):
            self.source_path = source_path
            self.name = name
            self.filename = filename

    template = Template('configs/mainsail-idex.cfg', 'mainsail-idex.cfg', 'mainsail_idex_cfg_V1_0_1.cfg')
    assert resolve_template_target_path(template) == 'configs/mainsail-idex.cfg'

    template2 = Template('', 'mainsail-idex.cfg', 'mainsail_idex_cfg_V1_0_1.cfg')
    assert resolve_template_target_path(template2) == 'mainsail-idex.cfg'


def test_select_templates_for_sync_filters_by_selected_ids_and_dedupes_targets():
    class Template:
        def __init__(self, template_id, name, filename, source_path, updated_at):
            self.id = template_id
            self.name = name
            self.filename = filename
            self.source_path = source_path
            self.updated_at = updated_at

    templates = [
        Template('1', 'printer.cfg', 'printer_cfg_v1.cfg', '', '2026-03-10T00:00:00'),
        Template('2', 'mainsail-idex.cfg', 'mainsail_idex_cfg_v1.cfg', '', '2026-03-10T00:00:00'),
        Template('3', 'mainsail-idex.cfg', 'mainsail_idex_cfg_v2.cfg', '', '2026-03-10T01:00:00'),
        Template('4', 'custom.cfg', 'custom.cfg', '', '2026-03-10T00:00:00'),
    ]

    selected = select_templates_for_sync(templates, {'1', '2', '3'})
    selected_ids = {t.id for t in selected}

    # printer.cfg is kept, mainsail-idex.cfg is deduped to the latest template by updated_at,
    # and custom.cfg is excluded because it wasn't selected.
    assert '1' in selected_ids
    assert '3' in selected_ids
    assert '2' not in selected_ids
    assert '4' not in selected_ids
