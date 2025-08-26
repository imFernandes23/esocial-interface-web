import { TestBed } from '@angular/core/testing';

import { XmlKit } from './xml-kit';

describe('XmlKit', () => {
  let service: XmlKit;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(XmlKit);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
