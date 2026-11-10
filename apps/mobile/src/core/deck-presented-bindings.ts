import type {SlotEntry} from './deck-model';
/** Every numbered surface shares the exact protected-store ACK gate, including lists and key details. */
export function presentedDeckBindings(slots:readonly(SlotEntry|null)[],acknowledged:boolean):readonly(SlotEntry|null)[]{
 return acknowledged?slots:slots.map(()=>null);
}
