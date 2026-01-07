import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { IconComponent } from '@shared/components/icon/icon.component';
import { Button } from 'primeng/button';

@Component({
  selector: 'app-observation-confirmation',
  templateUrl: './observation-confirmation.component.html',
  styleUrls: ['./observation-confirmation.component.scss'],
  imports: [IconComponent, TranslateModule, Button, RouterLink],
  standalone: true,
})
export class ObservationConfirmationComponent {}
