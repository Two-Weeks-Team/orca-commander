import type { ImageProps } from 'expo-image';
import manifest from '../../../assets/deck/manifest.json';

// Static requires let Metro bundle every production skin asset.
export const deckBase: ImageProps['source'] = require('../../../assets/deck/base.png');
export const deckSprites = {
  agent_amber_up: require('../../../assets/deck/sprites/agent_amber_up.png'),
  agent_amber_pressed: require('../../../assets/deck/sprites/agent_amber_pressed.png'),
  agent_amber_selected: require('../../../assets/deck/sprites/agent_amber_selected.png'),
  agent_violet_up: require('../../../assets/deck/sprites/agent_violet_up.png'),
  agent_violet_pressed: require('../../../assets/deck/sprites/agent_violet_pressed.png'),
  agent_violet_selected: require('../../../assets/deck/sprites/agent_violet_selected.png'),
  agent_blue_up: require('../../../assets/deck/sprites/agent_blue_up.png'),
  agent_blue_pressed: require('../../../assets/deck/sprites/agent_blue_pressed.png'),
  agent_blue_selected: require('../../../assets/deck/sprites/agent_blue_selected.png'),
  agent_green_up: require('../../../assets/deck/sprites/agent_green_up.png'),
  agent_green_pressed: require('../../../assets/deck/sprites/agent_green_pressed.png'),
  agent_green_selected: require('../../../assets/deck/sprites/agent_green_selected.png'),
  agent_red_up: require('../../../assets/deck/sprites/agent_red_up.png'),
  agent_red_pressed: require('../../../assets/deck/sprites/agent_red_pressed.png'),
  agent_red_selected: require('../../../assets/deck/sprites/agent_red_selected.png'),
  agent_gray_up: require('../../../assets/deck/sprites/agent_gray_up.png'),
  agent_gray_pressed: require('../../../assets/deck/sprites/agent_gray_pressed.png'),
  agent_gray_selected: require('../../../assets/deck/sprites/agent_gray_selected.png'),
  agent_off_up: require('../../../assets/deck/sprites/agent_off_up.png'),
  agent_off_pressed: require('../../../assets/deck/sprites/agent_off_pressed.png'),
  agent_off_selected: require('../../../assets/deck/sprites/agent_off_selected.png'),
  cmd_up: require('../../../assets/deck/sprites/cmd_up.png'),
  cmd_pressed: require('../../../assets/deck/sprites/cmd_pressed.png'),
  ptt_up: require('../../../assets/deck/sprites/ptt_up.png'),
  ptt_pressed: require('../../../assets/deck/sprites/ptt_pressed.png'),
  ptt_active: require('../../../assets/deck/sprites/ptt_active.png'),
  stick_center: require('../../../assets/deck/sprites/stick_center.png'),
  stick_left: require('../../../assets/deck/sprites/stick_left.png'),
  stick_right: require('../../../assets/deck/sprites/stick_right.png'),
  stick_up: require('../../../assets/deck/sprites/stick_up.png'),
  stick_down: require('../../../assets/deck/sprites/stick_down.png'),
  dial: require('../../../assets/deck/sprites/dial.png'),
} satisfies Record<string, ImageProps['source']>;

export type DeckSpriteName = keyof typeof deckSprites;

// Sprite x/y/px preserve the original crop; placementsPx gives compose.py destinations.
export const deckManifest = manifest;

/** Provider marks and control icons (assets/deck/icons/SOURCES.md). White icons take a tint. */
export const deckIcons = {
  claude: require('../../../assets/deck/icons/claude.png'),
  openai: require('../../../assets/deck/icons/openai.png'),
  terminal: require('../../../assets/deck/icons/terminal.png'),
  refresh: require('../../../assets/deck/icons/refresh.png'),
  monitor: require('../../../assets/deck/icons/monitor.png'),
  activity: require('../../../assets/deck/icons/activity.png'),
  check: require('../../../assets/deck/icons/circle-check.png'),
  unproven: require('../../../assets/deck/icons/circle-dashed.png'),
  question: require('../../../assets/deck/icons/message-circle-question.png'),
} satisfies Record<string, ImageProps['source']>;

/** Approved A/B1 backgrounds. Existing phone sprites are resized by shared geometry. */
export const approvedInnerBase:ImageProps['source']=require('../../../assets/deck/fold-inner/base.png');
export const approvedCoverBase:ImageProps['source']=require('../../../assets/deck/fold-cover/base.png');
