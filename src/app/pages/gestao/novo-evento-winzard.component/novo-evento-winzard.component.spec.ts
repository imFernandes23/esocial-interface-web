import { ComponentFixture, TestBed } from '@angular/core/testing';

import { NovoEventoWinzardComponent } from './novo-evento-winzard.component';

describe('NovoEventoWinzardComponent', () => {
  let component: NovoEventoWinzardComponent;
  let fixture: ComponentFixture<NovoEventoWinzardComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [NovoEventoWinzardComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(NovoEventoWinzardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
