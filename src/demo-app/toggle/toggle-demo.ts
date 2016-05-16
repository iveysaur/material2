import {Component} from '@angular/core';
import {MdToggle, MdToggleGroup} from '../../components/toggle/toggle';
import {MdToggleDispatcher} from '../../components/toggle/toggle_dispatcher';

@Component({
  selector: 'toggle-demo',
  templateUrl: 'demo-app/toggle/toggle-demo.html',
  providers: [MdToggleDispatcher],
  directives: [MdToggle, MdToggleGroup]
})
export class ToggleDemo { }
