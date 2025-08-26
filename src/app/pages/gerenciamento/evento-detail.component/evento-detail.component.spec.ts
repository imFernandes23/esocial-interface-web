import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EventoDetailComponent } from './evento-detail.component';

describe('EventoDetailComponent', () => {
  let component: EventoDetailComponent;
  let fixture: ComponentFixture<EventoDetailComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EventoDetailComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(EventoDetailComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
